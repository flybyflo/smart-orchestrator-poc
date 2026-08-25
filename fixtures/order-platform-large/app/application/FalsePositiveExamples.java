package application;

public class FalsePositiveExamples {
    public void unrelated() {
        LocalBilling billing = new LocalBilling();
        billing.authorize("local", 1);

        LocalCatalog catalog = new LocalCatalog();
        catalog.priceForSku("local");
    }

    static class LocalBilling {
        String authorize(String accountId, int cents) {
            return accountId + cents;
        }
    }

    static class LocalCatalog {
        String priceForSku(String sku) {
            return sku;
        }
    }
}
