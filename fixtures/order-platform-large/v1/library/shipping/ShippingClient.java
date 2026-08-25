package library.shipping;

public class ShippingClient {
    public String quote(String postalCode, int grams) {
        return postalCode + ":" + grams;
    }

    public String createLabel(String orderId) {
        return "label:" + orderId;
    }

    public void cancelLabel(String labelId) {
        if (labelId == null) {
            throw new IllegalArgumentException("labelId");
        }
    }
}
