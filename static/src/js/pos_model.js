/** @odoo-module **/
import { Order } from "point_of_sale.models";
import { PosStore } from "point_of_sale.PosStore";
import { patch } from "@web/core/utils/patch";
import { TicketScreen } from "point_of_sale.screens.TicketScreen";

patch(PosStore.prototype, {
    async _flush_orders(orders, options = {}) {
        const res = await this._super(...arguments);  // mejor usar await con super (asumiendo soporte)
        orders.forEach((order) => {
            if (!order.to_invoice) {
                res.then(async (order_server_id) => {
                    const orm = options.to_invoice ? this.orm : this.orm.silent;
                    try {
                        const output = await orm.call(
                            "pos.order",
                            "read",
                            [order_server_id[0].id, ['account_move']]
                        );
                        if (output.length) {
                            const invoiceStr = output[0]['account_move'][1];
                            const invoice_number = invoiceStr.split(" ")[1];
                            const invoice_letter = invoiceStr.split(" ")[0].substring(3, 4);
                            const account_move = output[0]['account_move'][0];
                            const current_order = this.get_order();
                            current_order.invoice_number = invoice_number;
                            current_order.invoice_letter = invoice_letter;
                            current_order.company_parent_name = current_order.pos.company.parent_id[1];
                            try {
                                const company = await orm.call(
                                    "res.company",
                                    "search_read",
                                    [
                                        [['id', '=', current_order.pos.company.parent_id[0]]],
                                        ['name','vat','l10n_ar_gross_income_number','l10n_ar_afip_start_date']
                                    ]
                                );
                                current_order.company_parent = company[0];
                            } catch (error) {
                                console.error(error);
                            }
                            try {
                                const invoices = await orm.call(
                                    "account.move",
                                    "search_read",
                                    [
                                        [['id', '=', account_move]],
                                        ['invoice_date','l10n_ar_afip_auth_code','l10n_ar_afip_auth_code_due','l10n_ar_afip_qr_code','l10n_latam_document_type_id']
                                    ]
                                );
                                current_order.invoice_date = invoices[0].invoice_date;
                                current_order.l10n_ar_afip_qr_code = invoices[0].l10n_ar_afip_qr_code;
                                current_order.l10n_ar_afip_auth_code = invoices[0].l10n_ar_afip_auth_code;
                                current_order.l10n_ar_afip_auth_code_due = invoices[0].l10n_ar_afip_auth_code_due;
                                current_order.l10n_latam_document_type_id = invoices[0].l10n_latam_document_type_id[1].split(" ")[0];
                                current_order.l10n_latam_document_name = invoices[0].l10n_latam_document_type_id[1].substr(invoices[0].l10n_latam_document_type_id[1].indexOf(" ") + 1);
                            } catch (error) {
                                console.error(error);
                            }
                        }
                    } catch (error) {
                        console.error(error);
                    }
                }).catch(error => {
                    console.error(error);
                });
            }
        });
        return res;
    },
});

patch(Order.prototype, {
    setup() {
        this._super(...arguments);
        if (!this.get_partner()) {
            const default_customer = this.pos.config.default_partner_id;
            const default_customer_by_id = this.pos.db.get_partner_by_id(default_customer[0]);
            if (default_customer_by_id) {
                this.set_partner(default_customer_by_id);
            }
        }
        const default_to_invoice = this.pos.config.pos_auto_invoice;
        this.set_to_invoice(default_to_invoice);
    },
    export_for_printing() {
        const result = this._super(...arguments);
        result.headerData.pos = result.headerData.pos || {};
        result.headerData.pos.config = result.headerData.pos.config || this.pos.config;
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

patch(TicketScreen.prototype, {
    async onDoRefund() {
        const order = this.getSelectedOrder();

        if (order && this._doesOrderHaveSoleItem(order)) {
            if (!this._prepareAutoRefundOnOrder(order)) {
                return;
            }
        }

        if (!order) {
            this._state.ui.highlightHeaderNote = !this._state.ui.highlightHeaderNote;
            return;
        }

        const partner = order.get_partner();
        if (!partner) {
            console.log("No se encontró un cliente asociado, utilizando Consumidor Final");
        }
        const allToRefundDetails = this._getRefundableDetails(partner);
        if (allToRefundDetails.length === 0) {
            this._state.ui.highlightHeaderNote = !this._state.ui.highlightHeaderNote;
            return;
        }

        const invoicedOrderIds = new Set(
            allToRefundDetails
                .filter(
                    detail =>
                        this._state.syncedOrders.cache[detail.orderline.orderBackendId]?.state ===
                        "invoiced"
                )
                .map(detail => detail.orderline.orderBackendId)
        );

        if (invoicedOrderIds.size > 1) {
            this.showPopup("ErrorPopup", {
                title: "Multiple Invoiced Orders Selected",
                body: "You have selected orderlines from multiple invoiced orders. To proceed refund, please select orderlines from the same invoiced order.",
            });
            return;
        }

        const destinationOrder =
            this.props.destinationOrder &&
            partner === this.props.destinationOrder.get_partner() &&
            !this.pos.doNotAllowRefundAndSales()
                ? this.props.destinationOrder
                : this._getEmptyOrder(partner);

        const originalToDestinationLineMap = new Map();

        for (const refundDetail of allToRefundDetails) {
            const product = this.pos.db.get_product_by_id(refundDetail.orderline.productId);
            const options = this._prepareRefundOrderlineOptions(refundDetail);
            const newOrderline = await destinationOrder.add_product(product, options);
            originalToDestinationLineMap.set(refundDetail.orderline.id, newOrderline);
            refundDetail.destinationOrderUid = destinationOrder.uid;
        }

        for (const refundDetail of allToRefundDetails) {
            const originalOrderline = refundDetail.orderline;
            const destinationOrderline = originalToDestinationLineMap.get(originalOrderline.id);
            if (originalOrderline.comboParent) {
                const comboParentLine = originalToDestinationLineMap.get(originalOrderline.comboParent.id);
                if (comboParentLine) {
                    destinationOrderline.comboParent = comboParentLine;
                }
            }
            if (originalOrderline.comboLines && originalOrderline.comboLines.length > 0) {
                destinationOrderline.comboLines = originalOrderline.comboLines.map(comboLine => originalToDestinationLineMap.get(comboLine.id));
            }
        }

        if (order.fiscal_position_not_found) {
            this.showPopup("ErrorPopup", {
                title: "Fiscal Position not found",
                body: "The fiscal position used in the original order is not loaded. Make sure it is loaded by adding it in the pos configuration.",
            });
            return;
        }
        destinationOrder.fiscal_position = order.fiscal_position;

        if (partner) {
            destinationOrder.set_partner(partner);
        } else {
            const default_customer = this.pos.config.default_partner_id;
            const default_customer_by_id = this.pos.db.get_partner_by_id(default_customer[0]);
            if (default_customer_by_id) {
                destinationOrder.set_partner(default_customer_by_id);
            }
        }

        if (this.pos.get_order().cid !== destinationOrder.cid) {
            this.pos.set_order(destinationOrder);
        }
        await this.addAdditionalRefundInfo(order, destinationOrder);

        this.closeTicketScreen();
    },
});
