from odoo import fields, models


class FmdbDevice(models.Model):
    _name = "fmdb.device"
    _description = "FindMyDeviceBD Device"
    _order = "last_seen desc, id desc"

    name = fields.Char(required=True)
    owner_id = fields.Many2one("res.users", required=True, ondelete="cascade", index=True)
    browser_key = fields.Char(required=True, index=True, copy=False)
    latitude = fields.Float(digits=(10, 7))
    longitude = fields.Float(digits=(10, 7))
    accuracy = fields.Float(digits=(10, 2))
    last_seen = fields.Datetime(index=True)
    is_lost = fields.Boolean(default=False)

    _sql_constraints = [
        (
            "fmdb_device_owner_browser_uniq",
            "unique(owner_id, browser_key)",
            "This browser is already registered for the account.",
        ),
    ]
