/** @odoo-module */
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
patch(PaymentScreen.prototype, {
	setup() {
        super.setup(...arguments);
    },
	shouldDownloadInvoice() {
        if (this.pos.config.pos_stop_invoice_print) {
        	return false;
        } else {
            return super.shouldDownloadInvoice(); 
        }
    },	
    async afterOrderValidation(suggestToSync = true) {
        // timeout para carga de datos fiscales
        await new Promise(resolve => setTimeout(resolve, 1000));
        return super.afterOrderValidation(...arguments);
    },
});
