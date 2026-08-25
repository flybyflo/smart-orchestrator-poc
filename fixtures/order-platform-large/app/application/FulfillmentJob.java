package application;

import library.billing.BillingClient;
import library.shipping.ShippingClient;

public class FulfillmentJob {
    public String fulfill(String authorizationId, String orderId) {
        BillingClient billing = new BillingClient();
        ShippingClient shipping = new ShippingClient();

        String captureId = billing.capture(authorizationId);
        String label = shipping.createLabel(orderId);

        return captureId + ":" + label;
    }
}
