from odoo import fields, models


class ResUsers(models.Model):
    _inherit = "res.users"

    fmdb_phone = fields.Char(index=True, copy=False)

    _sql_constraints = [
        (
            "fmdb_phone_uniq",
            "unique(fmdb_phone)",
            "A mobile number can only be used by one FindMyDeviceBD account.",
        ),
    ]
