import json
import math
import re
import uuid

from psycopg2 import IntegrityError

from odoo import fields, http
from odoo.http import request


def _response(data, status=200):
    return request.make_json_response(data, status=status)


def _body():
    try:
        value = json.loads(request.httprequest.get_data(as_text=True))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _phone(value):
    if not isinstance(value, str):
        return None
    digits = re.sub(r"\D", "", value)
    if digits.startswith("880"):
        national = "0" + digits[3:]
    else:
        national = digits
    if not re.fullmatch(r"01[3-9]\d{8}", national):
        return None
    return "+880" + national[1:]


def _account():
    user = request.env.user
    if user._is_public() or not user.fmdb_phone:
        return None
    return user


def _device_json(device, current_user):
    return {
        "id": device.id,
        "name": device.name,
        "owner_name": device.owner_id.name,
        "is_mine": device.owner_id.id == current_user.id,
        "latitude": device.latitude if device.last_seen else None,
        "longitude": device.longitude if device.last_seen else None,
        "accuracy": device.accuracy if device.last_seen else None,
        "last_seen": fields.Datetime.to_string(device.last_seen) if device.last_seen else None,
        "is_lost": device.is_lost,
    }


class FmdbLocationController(http.Controller):
    @http.route(
        "/api/fmdb/session",
        type="http",
        auth="public",
        methods=["GET"],
        csrf=False,
    )
    def session_status(self, **kwargs):
        return _response({"authenticated": bool(_account())})

    @http.route(
        "/api/fmdb/register",
        type="http",
        auth="public",
        methods=["POST"],
        csrf=False,
    )
    def register(self, **kwargs):
        body = _body()
        if body is None:
            return _response({"error": "সঠিক JSON তথ্য পাঠান।"}, 400)
        name = body.get("name")
        phone = _phone(body.get("phone"))
        password = body.get("password")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
            return _response({"error": "নাম ১–১২০ অক্ষরের মধ্যে দিন।"}, 400)
        if phone is None:
            return _response({"error": "বাংলাদেশের সঠিক মোবাইল নম্বর দিন।"}, 400)
        if not isinstance(password, str) or len(password) < 10:
            return _response({"error": "পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।"}, 400)
        users = request.env["res.users"].sudo()
        if users.search_count([("fmdb_phone", "=", phone)]):
            return _response({"error": "এই নম্বরে ইতিমধ্যে একটি অ্যাকাউন্ট আছে।"}, 409)
        portal_group = request.env.ref("base.group_portal")
        try:
            with request.env.cr.savepoint():
                users.with_context(no_reset_password=True).create(
                    {
                        "name": name.strip(),
                        "login": phone,
                        "password": password,
                        "fmdb_phone": phone,
                        "groups_id": [(6, 0, [portal_group.id])],
                    }
                )
        except IntegrityError as error:
            if error.diag.constraint_name not in {
                "res_users_fmdb_phone_uniq",
                "res_users_login_key",
            }:
                raise
            return _response({"error": "এই নম্বরে ইতিমধ্যে একটি অ্যাকাউন্ট আছে।"}, 409)
        return _response({"phone": phone}, 201)

    @http.route(
        "/api/fmdb/me",
        type="http",
        auth="user",
        methods=["GET"],
        csrf=False,
    )
    def me(self, **kwargs):
        user = _account()
        if not user:
            return _response({"error": "FindMyDeviceBD অ্যাকাউন্টে লগইন করুন।"}, 401)
        return _response({"name": user.name, "phone": user.fmdb_phone})

    @http.route(
        "/api/fmdb/devices",
        type="http",
        auth="user",
        methods=["GET"],
        csrf=False,
    )
    def devices(self, **kwargs):
        user = _account()
        if not user:
            return _response({"error": "FindMyDeviceBD অ্যাকাউন্টে লগইন করুন।"}, 401)
        accepted = request.env["fmdb.share"].sudo().search(
            [
                ("owner_id", "=", user.id),
                ("state", "=", "accepted"),
                ("invitee_id", "!=", False),
            ]
        )
        owner_ids = [user.id] + accepted.mapped("invitee_id").ids
        devices = request.env["fmdb.device"].sudo().search(
            [("owner_id", "in", owner_ids)]
        )
        return _response({"devices": [_device_json(device, user) for device in devices]})

    @http.route(
        "/api/fmdb/devices/register",
        type="http",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def register_device(self, **kwargs):
        user = _account()
        if not user:
            return _response({"error": "FindMyDeviceBD অ্যাকাউন্টে লগইন করুন।"}, 401)
        body = _body()
        if body is None:
            return _response({"error": "সঠিক JSON তথ্য পাঠান।"}, 400)
        name = body.get("name")
        try:
            browser_key = str(uuid.UUID(body.get("browser_key", "")))
        except (ValueError, AttributeError, TypeError):
            return _response({"error": "ডিভাইস শনাক্তকরণ তথ্যটি সঠিক নয়।"}, 400)
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
            return _response({"error": "ডিভাইসের নাম ১–১০০ অক্ষরের মধ্যে দিন।"}, 400)
        devices = request.env["fmdb.device"].sudo()
        device = devices.search(
            [("owner_id", "=", user.id), ("browser_key", "=", browser_key)],
            limit=1,
        )
        if device:
            device.write({"name": name.strip()})
        else:
            device = devices.create(
                {
                    "name": name.strip(),
                    "owner_id": user.id,
                    "browser_key": browser_key,
                }
            )
        return _response({"device": _device_json(device, user)}, 200)

    @http.route(
        "/api/fmdb/devices/location",
        type="http",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def update_location(self, **kwargs):
        user = _account()
        if not user:
            return _response({"error": "FindMyDeviceBD অ্যাকাউন্টে লগইন করুন।"}, 401)
        body = _body()
        if body is None:
            return _response({"error": "সঠিক JSON তথ্য পাঠান।"}, 400)
        device_id = body.get("device_id")
        latitude = body.get("latitude")
        longitude = body.get("longitude")
        accuracy = body.get("accuracy", 0)
        if isinstance(device_id, bool) or not isinstance(device_id, int):
            return _response({"error": "ডিভাইসটি সঠিক নয়।"}, 400)
        if any(
            isinstance(value, bool) or not isinstance(value, (int, float))
            for value in (latitude, longitude, accuracy)
        ):
            return _response({"error": "অবস্থানের স্থানাঙ্ক সঠিক নয়।"}, 400)
        if not all(math.isfinite(value) for value in (latitude, longitude, accuracy)):
            return _response({"error": "অবস্থানের স্থানাঙ্ক সঠিক নয়।"}, 400)
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180 or accuracy < 0:
            return _response({"error": "অবস্থানের স্থানাঙ্ক সীমার বাইরে।"}, 400)
        device = request.env["fmdb.device"].sudo().search(
            [("id", "=", device_id), ("owner_id", "=", user.id)],
            limit=1,
        )
        if not device:
            return _response({"error": "নিজের ডিভাইসটি পাওয়া যায়নি।"}, 404)
        device.write(
            {
                "latitude": latitude,
                "longitude": longitude,
                "accuracy": accuracy,
                "last_seen": fields.Datetime.now(),
            }
        )
        return _response({"device": _device_json(device, user)})

    @http.route(
        "/api/fmdb/invitations",
        type="http",
        auth="user",
        methods=["GET"],
        csrf=False,
    )
    def invitations(self, **kwargs):
        user = _account()
        if not user:
            return _response({"error": "FindMyDeviceBD অ্যাকাউন্টে লগইন করুন।"}, 401)
        shares = request.env["fmdb.share"].sudo()
        incoming = shares.search(
            [
                ("state", "=", "pending"),
                ("invitee_phone", "=", user.fmdb_phone),
            ]
        )
        incoming += shares.search(
            [
                ("state", "=", "pending"),
                ("invitee_id", "=", user.id),
                ("id", "not in", incoming.ids),
            ]
        )
        accepted_incoming = shares.search(
            [
                ("state", "=", "accepted"),
                ("invitee_id", "=", user.id),
            ]
        )
        outgoing = shares.search([("owner_id", "=", user.id)])
        return _response(
            {
                "incoming": [
                    {"id": item.id, "owner_name": item.owner_id.name}
                    for item in incoming
                ],
                "accepted_incoming": [
                    {"id": item.id, "owner_name": item.owner_id.name}
                    for item in accepted_incoming
                ],
                "outgoing": [
                    {
                        "id": item.id,
                        "phone": item.invitee_phone,
                        "state": item.state,
                    }
                    for item in outgoing
                ],
            }
        )

    @http.route(
        "/api/fmdb/invitations/create",
        type="http",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def create_invitation(self, **kwargs):
        user = _account()
        if not user:
            return _response({"error": "FindMyDeviceBD অ্যাকাউন্টে লগইন করুন।"}, 401)
        body = _body()
        if body is None:
            return _response({"error": "সঠিক JSON তথ্য পাঠান।"}, 400)
        phone = _phone(body.get("phone"))
        if phone is None:
            return _response({"error": "বাংলাদেশের সঠিক মোবাইল নম্বর দিন।"}, 400)
        if phone == user.fmdb_phone:
            return _response({"error": "নিজের নম্বরে আমন্ত্রণ পাঠানো যাবে না।"}, 400)
        target = request.env["res.users"].sudo().search(
            [("fmdb_phone", "=", phone)], limit=1
        )
        shares = request.env["fmdb.share"].sudo()
        invitation = shares.search(
            [("owner_id", "=", user.id), ("invitee_phone", "=", phone)],
            limit=1,
        )
        if invitation and invitation.state == "accepted":
            return _response({"error": "এই নম্বরের সঙ্গে লোকেশন শেয়ার চালু আছে।"}, 409)
        values = {
            "invitee_id": target.id or False,
            "state": "pending",
        }
        if invitation:
            invitation.write(values)
        else:
            values.update({"owner_id": user.id, "invitee_phone": phone})
            invitation = shares.create(values)
        return _response({"id": invitation.id, "state": invitation.state}, 201)

    @http.route(
        "/api/fmdb/invitations/action",
        type="http",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def invitation_action(self, **kwargs):
        user = _account()
        if not user:
            return _response({"error": "FindMyDeviceBD অ্যাকাউন্টে লগইন করুন।"}, 401)
        body = _body()
        if body is None:
            return _response({"error": "সঠিক JSON তথ্য পাঠান।"}, 400)
        invitation_id = body.get("id")
        action = body.get("action")
        if isinstance(invitation_id, bool) or not isinstance(invitation_id, int):
            return _response({"error": "আমন্ত্রণটি সঠিক নয়।"}, 400)
        if action not in {"accept", "reject", "revoke", "leave"}:
            return _response({"error": "অনুমোদিত কাজটি বেছে নিন।"}, 400)
        invitation = request.env["fmdb.share"].sudo().browse(invitation_id).exists()
        if not invitation:
            return _response({"error": "আমন্ত্রণটি পাওয়া যায়নি।"}, 404)
        if action in {"accept", "reject"}:
            is_invitee = (
                invitation.invitee_phone == user.fmdb_phone
                or invitation.invitee_id.id == user.id
            )
            if not is_invitee or invitation.state != "pending":
                return _response({"error": "এই আমন্ত্রণে আপনার অনুমতি নেই।"}, 403)
            invitation.write(
                {
                    "invitee_id": user.id,
                    "state": "accepted" if action == "accept" else "rejected",
                }
            )
        elif action == "revoke":
            if invitation.owner_id.id != user.id:
                return _response({"error": "শুধু আমন্ত্রণদাতা শেয়ার বন্ধ করতে পারবেন।"}, 403)
            invitation.write({"state": "revoked"})
        else:
            if invitation.invitee_id.id != user.id:
                return _response({"error": "এই শেয়ারটি আপনার নয়।"}, 403)
            invitation.write({"state": "revoked"})
        return _response({"state": invitation.state})

    @http.route(
        "/api/fmdb/devices/lost",
        type="http",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def mark_lost(self, **kwargs):
        user = _account()
        if not user:
            return _response({"error": "FindMyDeviceBD অ্যাকাউন্টে লগইন করুন।"}, 401)
        body = _body()
        if body is None:
            return _response({"error": "সঠিক JSON তথ্য পাঠান।"}, 400)
        device_id = body.get("device_id")
        is_lost = body.get("is_lost")
        if (
            isinstance(device_id, bool)
            or not isinstance(device_id, int)
            or not isinstance(is_lost, bool)
        ):
            return _response({"error": "হারানো ডিভাইসের তথ্যটি সঠিক নয়।"}, 400)
        device = request.env["fmdb.device"].sudo().search(
            [("id", "=", device_id), ("owner_id", "=", user.id)],
            limit=1,
        )
        if not device:
            return _response({"error": "নিজের ডিভাইসটি পাওয়া যায়নি।"}, 404)
        device.write({"is_lost": is_lost})
        return _response({"device": _device_json(device, user)})
