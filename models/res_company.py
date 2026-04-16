from odoo import models


class ResCompany(models.Model):
    _inherit = 'res.company'

    def _load_pos_data_fields(self, config_id):
        fields = super()._load_pos_data_fields(config_id)
        if self.env.company.country_id.code == 'AR':
            fields += [
                'l10n_ar_afip_responsibility_type_id',
                'l10n_ar_gross_income_number',
                'l10n_ar_afip_start_date',
                'parent_id',
            ]
        return fields
