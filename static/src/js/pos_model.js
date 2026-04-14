/** @odoo-module */
import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

patch(PosStore.prototype, {
    async postSyncAllOrders(orders) {
        await super.postSyncAllOrders(orders);
        for (const order of orders) {
            if (!order.to_invoice) continue;
            const accountMoveId = order.raw.account_move;
            if (!accountMoveId) continue;

            try {
                const [invoice] = await this.data.call(
                    "account.move", "search_read",
                    [[["id", "=", accountMoveId]],
                     ["name", "invoice_date", "afip_auth_code",
                      "afip_auth_code_due", "afip_qr_code",
                      "l10n_latam_document_type_id"]]
                );
                if (!invoice) continue;

                const fmtDate = (s) => {
                    if (!s) return s;
                    const [y, m, d] = s.split('-');
                    return `${d}/${m}/${y}`;
                };

                const moveStr = invoice.name || "";
                Object.assign(order, {
                    invoice_number: moveStr.split(" ")[1] || moveStr,
                    invoice_letter: moveStr.substring(3, 4),
                    invoice_date: fmtDate(invoice.invoice_date),
                    afip_qr_code: invoice.afip_qr_code,
                    afip_auth_code: invoice.afip_auth_code,
                    afip_auth_code_due: fmtDate(invoice.afip_auth_code_due),
                    l10n_latam_document_type_id: invoice.l10n_latam_document_type_id[1].split(" ")[0],
                    l10n_latam_document_name: invoice.l10n_latam_document_type_id[1].split(" ").slice(1).join(" "),
                });

                const parentId = this.company.parent_id?.[0];
                if (parentId) {
                    order.company_parent_name = this.company.parent_id[1];
                    try {
                        const [company] = await this.data.call(
                            "res.company", "search_read",
                            [[["id", "=", parentId]],
                             ["name", "vat", "l10n_ar_gross_income_number", "l10n_ar_afip_start_date"]]
                        );
                        order.company_parent = company;
                    } catch (err) {
                        console.error("Company fetch error:", err);
                    }
                }
            } catch (err) {
                console.error("postSyncAllOrders AFIP error:", err);
            }
        }
    },
});

patch(PosOrder.prototype, {
    setup(vals) {
        super.setup(vals);
        if (!this.get_partner() && this.config?.default_partner_id) {
            const partnerId = this.config.default_partner_id?.id
                || this.config.default_partner_id;
            const partner = this.models["res.partner"].get(partnerId);
            if (partner) {
                this.set_partner(partner);
            }
        }
    },

    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(baseUrl, headerData);
        result.headerData = result.headerData || {};
        result.headerData.config = this.config;
        result.headerData.pos = { config: this.config };
        result.headerData.partner = this.get_partner();

        for (const field of [
            "invoice_number", "invoice_letter", "invoice_date",
            "afip_qr_code", "afip_auth_code", "afip_auth_code_due",
            "l10n_latam_document_type_id", "l10n_latam_document_name",
            "company_parent", "company_parent_name",
        ]) {
            if (this[field] !== undefined) {
                result.headerData[field] = this[field];
            }
        }
        return result;
    },
});
