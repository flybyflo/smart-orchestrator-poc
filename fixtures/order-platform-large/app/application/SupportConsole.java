package application;

import library.billing.BillingClient;
import library.catalog.CatalogClient;
import library.shipping.ShippingClient;

public class SupportConsole {
    public void reverse(String paymentId, String reservationId, String labelId) {
        BillingClient billing = new BillingClient();
        CatalogClient catalog = new CatalogClient();
        ShippingClient shipping = new ShippingClient();

        billing.refund(paymentId, 200);
        catalog.releaseInventory(reservationId);
        shipping.cancelLabel(labelId);
    }
}
