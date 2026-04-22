import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";

patch(PaymentScreen.prototype, {
    shouldDownloadInvoice() {
        if (this.pos.config.pos_stop_invoice_print) {
            return false;
        }
        return super.shouldDownloadInvoice();
    },
});
