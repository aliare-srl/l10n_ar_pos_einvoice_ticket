/** @odoo-module */
import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { Order } from "@point_of_sale/app/store/models";
import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { ErrorPopup } from "@point_of_sale/app/utils/popups/popups";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    async _flush_orders(orders, options = {}) {
        const res = super._flush_orders(...arguments);
        res.then(async (order_server_id) => {
            for (const order of orders) {
                if (!order.to_invoice) {
                    const orm = options.to_invoice ? this.orm : this.orm.silent;
                    try {
                        const output = await orm.call("pos.order", "read", [order_server_id[0].id, ["account_move"]]);
                        if (output.length) {
                            const moveStr = output[0].account_move[1];
                            const invoice_number = moveStr.split(" ")[1];
                            const invoice_letter = moveStr.substring(3, 4);
                            const account_move = output[0].account_move[0];

                            const current_order = this.get_order();
                            Object.assign(current_order, {
                                invoice_number,
                                invoice_letter,
                                company_parent_name: current_order.pos.company.parent_id[1],
                            });

                            try {
                                const [company] = await orm.call("res.company", "search_read", [[['id', '=', current_order.pos.company.parent_id[0]]], ['name', 'vat', 'l10n_ar_gross_income_number', 'l10n_ar_afip_start_date']]);
                                current_order.company_parent = company;
                            } catch (err) {
                                console.error("Company fetch error:", err);
                            }

                            try {
                                const [invoice] = await orm.call("account.move", "search_read", [[['id', '=', account_move]], ['invoice_date', 'l10n_ar_afip_auth_code', 'l10n_ar_afip_auth_code_due', 'l10n_ar_afip_qr_code', 'l10n_latam_document_type_id']]);
                                Object.assign(current_order, {
                                    invoice_date: invoice.invoice_date,
                                    l10n_ar_afip_qr_code: invoice.l10n_ar_afip_qr_code,
                                    l10n_ar_afip_auth_code: invoice.l10n_ar_afip_auth_code,
                                    l10n_ar_afip_auth_code_due: invoice.l10n_ar_afip_auth_code_due,
                                    l10n_latam_document_type_id: invoice.l10n_latam_document_type_id[1].split(" ")[0],
                                    l10n_latam_document_name: invoice.l10n_latam_document_type_id[1].split(" ").slice(1).join(" "),
                                });
                            } catch (err) {
                                console.error("Invoice fetch error:", err);
                            }
                        }
                    } catch (err) {
                        console.error("Flush order error:", err);
                    }
                }
            }
        });
        return res;
    },
});

patch(Order.prototype, {
    setup() {
        super.setup(...arguments);
        if (!this.get_partner()) {
            const [default_partner_id] = this.pos.config.default_partner_id;
            const partner = this.pos.db.get_partner_by_id(default_partner_id);
            if (partner) {
                this.set_partner(partner);
            }
        }
        this.set_to_invoice(this.pos.config.pos_auto_invoice);
    },

    export_for_printing() {
        const result = super.export_for_printing(...arguments);
        result.headerData = result.headerData || {};
        result.headerData.pos = result.headerData.pos || {};
        result.headerData.pos.config = this.pos.config;
        result.headerData.partner = this.get_partner();

        const fields = [
            "invoice_number",
            "invoice_letter",
            "invoice_date",
            "l10n_ar_afip_qr_code",
            "l10n_ar_afip_auth_code",
            "l10n_ar_afip_auth_code_due",
            "l10n_latam_document_type_id",
            "l10n_latam_document_name",
            "company_parent",
            "company_parent_name"
        ];

        for (const field of fields) {
            if (this[field]) {
                result.headerData[field] = this[field];
            }
        }

        return result;
    },
});
