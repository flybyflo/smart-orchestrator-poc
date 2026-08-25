package library.billing;

public class BillingClient {
    public String authorize(String accountId, int cents) {
        return "auth:" + accountId + ":" + cents;
    }

    public String capture(String authorizationId) {
        return "captured:" + authorizationId;
    }

    public void refund(String paymentId, int cents) {
        if (cents <= 0) {
            throw new IllegalArgumentException("cents");
        }
    }

    public boolean isSettled(String paymentId) {
        return paymentId != null && paymentId.startsWith("settled");
    }
}
