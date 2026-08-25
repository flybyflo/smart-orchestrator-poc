package library.catalog;

public class CatalogClient {
    public String priceForSku(String sku) {
        return "price:" + sku;
    }

    public boolean reserveInventory(String sku, int quantity) {
        return quantity > 0;
    }

    public void releaseInventory(String reservationId) {
        if (reservationId == null) {
            throw new IllegalArgumentException("reservationId");
        }
    }
}
