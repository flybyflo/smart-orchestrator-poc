package library.billing;

public class BillingClient {
    public String authorize(String accountId, int cents, String currency) {
        return "auth:" + accountId + ":" + cents + ":" + currency;
    }

    public String capture(String authorizationId, boolean finalCapture) {
        return "captured:" + authorizationId + ":" + finalCapture;
    }

    public void voidPayment(String paymentId, String reason) {
        if (reason == null) {
            throw new IllegalArgumentException("reason");
        }
    }

    public boolean isSettled(String paymentId) {
        return paymentId != null && paymentId.startsWith("settled");
    }

    public String paymentStatus(String paymentId) {
        return isSettled(paymentId) ? "settled" : "open";
    }
}
