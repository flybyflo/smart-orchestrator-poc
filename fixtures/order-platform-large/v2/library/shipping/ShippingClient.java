package library.shipping;

public class ShippingClient {
    public String quote(String postalCode, int grams, String serviceLevel) {
        return postalCode + ":" + grams + ":" + serviceLevel;
    }

    public String createLabel(String orderId, boolean insured) {
        return "label:" + orderId + ":" + insured;
    }

    public boolean cancelShipment(String labelId, String reason) {
        return labelId != null && reason != null;
    }

    public String track(String labelId) {
        return "track:" + labelId;
    }
}
