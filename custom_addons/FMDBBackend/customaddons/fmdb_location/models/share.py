from odoo import fields, models


class FmdbShare(models.Model):
    _name = "fmdb.share"
    _description = "FindMyDeviceBD Location Sharing Invitation"
    _order = "id desc"

    owner_id = fields.Many2one("res.users", required=True, ondelete="cascade", index=True)
    invitee_phone = fields.Char(required=True, index=True)
    invitee_id = fields.Many2one("res.users", ondelete="cascade", index=True)
    state = fields.Selection(
        [
            ("pending", "Pending"),
            ("accepted", "Accepted"),
            ("rejected", "Rejected"),
            ("revoked", "Revoked"),
        ],
        required=True,
        default="pending",
        index=True,
    )

    _sql_constraints = [
        (
            "fmdb_share_owner_phone_uniq",
            "unique(owner_id, invitee_phone)",
            "An invitation already exists for this phone number.",
        ),
    ]
