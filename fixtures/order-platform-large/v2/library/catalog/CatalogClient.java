package library.catalog;

public class CatalogClient {
    public String priceForSku(String sku, String region) {
        return "price:" + sku + ":" + region;
    }

    public String reserveInventory(String sku, int quantity, String channel) {
        return sku + ":" + quantity + ":" + channel;
    }

    public boolean releaseReservation(String reservationId) {
        return reservationId != null;
    }

    public boolean isAvailable(String sku) {
        return sku != null && !sku.isBlank();
    }
}
