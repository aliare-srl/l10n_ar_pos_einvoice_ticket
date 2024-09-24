/** @odoo-module */
import { Order } from "@point_of_sale/app/store/models";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";
patch(PosStore.prototype, {
    async _flush_orders(orders, options = {}) {
        var self = this;
        var res = super._flush_orders(...arguments);
        orders.forEach(function(order) {
            if (!order.to_invoice){
                res.then(async function(order_server_id) {
                    const orm = options.to_invoice ? self.orm : self.orm.silent;
                    orm.call(
                        "pos.order",
                        "read",
                        [order_server_id[0].id, ['account_move']],
                    ).then(function(output){
                        if(output.length){
                            const invoice_number = output[0]['account_move'][1].split(" ")[1];
                            const invoice_letter = output[0]['account_move'][1].split(" ")[0].substring(3, 4);
                            const account_move = output[0]['account_move'][0]
                            const current_order = self.get_order();
                            current_order.invoice_number = invoice_number;
                            current_order.invoice_letter = invoice_letter;
                            current_order.company_parent_name = current_order.pos.company.parent_id[1]
                            orm.call(
                                "res.company",
                                "search_read",
                                [
                                    [['id', '=', current_order.pos.company.parent_id[0]]], 
                                    [
                                        'name',
                                        'vat',
                                        'l10n_ar_gross_income_number',
                                        'l10n_ar_afip_start_date',
                                    ]
                                ],
                            ).then(function(company){
                                current_order.company_parent = company[0]
                            }).catch(function(error){
                                console.log(error)
                                return res
                            })
                            orm.call(
                                "account.move",
                                "search_read",
                                [
                                    [['id', '=', account_move]], 
                                    [
                                        'invoice_date',
                                        'l10n_ar_afip_auth_code',
                                        'l10n_ar_afip_auth_code_due',
                                        'l10n_ar_afip_qr_code',
                                        'l10n_latam_document_type_id',
                                    ]
                                ],
                            ).then(function(invoices){
                                current_order.invoice_date = invoices[0]['invoice_date'];
                                current_order.l10n_ar_afip_qr_code = invoices[0]['l10n_ar_afip_qr_code'];
                                current_order.l10n_ar_afip_auth_code = invoices[0]['l10n_ar_afip_auth_code'];
                                current_order.l10n_ar_afip_auth_code_due = invoices[0]['l10n_ar_afip_auth_code_due'];
                                current_order.l10n_latam_document_type_id = invoices[0]['l10n_latam_document_type_id'][1].split(" ")[0];
                                current_order.l10n_latam_document_name = invoices[0]['l10n_latam_document_type_id'][1].substr(invoices[0]['l10n_latam_document_type_id'][1].indexOf(" ") + 1);
                            }).catch(function(error){
                                console.log(error)
                                return res
                            })
                        }
                    }).catch(function(error){
                        console.log(error)
                        return res
                    });
                }).catch(function(error){
                    console.log(error)
                    return res
                })
            }
        })
        return res;
    },
});
patch(Order.prototype, {
    setup() {
        super.setup(...arguments);
        var default_customer = this.pos.config.default_partner_id;
        var default_customer_by_id = this.pos.db.get_partner_by_id(default_customer[0]);
        if(default_customer_by_id){
            this.set_partner(default_customer_by_id);
        }
        var default_to_invoice = this.pos.config.pos_auto_invoice;
        this.set_to_invoice(default_to_invoice);        
    },
    export_for_printing() {
        const result = super.export_for_printing(...arguments);
        result.headerData.pos = !result.headerData.pos ? {} : result.headerData.pos;
        result.headerData.pos.config = !result.headerData.pos.config ? this.pos.config : result.headerData.pos.config;
        if (this.get_partner()) {
            result.headerData.partner = this.get_partner();
        }
        if(this.invoice_number){
            result.headerData.invoice_number = this.invoice_number;
        }
        if(this.invoice_letter){
            result.headerData.invoice_letter = this.invoice_letter;
        }
        if(this.invoice_date){
            result.headerData.invoice_date = this.invoice_date;
        }
        if(this.l10n_ar_afip_qr_code){
            result.headerData.l10n_ar_afip_qr_code = this.l10n_ar_afip_qr_code;
        }
        if(this.l10n_ar_afip_auth_code){
            result.headerData.l10n_ar_afip_auth_code = this.l10n_ar_afip_auth_code;
        }
        if(this.l10n_ar_afip_auth_code_due){
            result.headerData.l10n_ar_afip_auth_code_due = this.l10n_ar_afip_auth_code_due;
        }
        if(this.l10n_latam_document_type_id){
            result.headerData.l10n_latam_document_type_id = this.l10n_latam_document_type_id;
        }
        if(this.l10n_latam_document_name){
            result.headerData.l10n_latam_document_name = this.l10n_latam_document_name;
        }
        if(this.company_parent){
            result.headerData.company_parent = this.company_parent;
        }
        if(this.company_parent_name){
            result.headerData.company_parent_name = this.company_parent_name;
        }
        return result;
    },
});