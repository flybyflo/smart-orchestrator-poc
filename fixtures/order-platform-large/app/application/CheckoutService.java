package application;

import library.billing.BillingClient;
import library.catalog.CatalogClient;
import library.shipping.ShippingClient;

public class CheckoutService {
    public String checkout(String accountId, String sku, String postalCode) {
        BillingClient billing = new BillingClient();
        CatalogClient catalog = new CatalogClient();
        ShippingClient shipping = new ShippingClient();

        String price = catalog.priceForSku(sku);
        boolean reserved = catalog.reserveInventory(sku, 1);
        String auth = billing.authorize(accountId, 1299);
        String quote = shipping.quote(postalCode, 500);

        return price + ":" + reserved + ":" + auth + ":" + quote;
    }
}
