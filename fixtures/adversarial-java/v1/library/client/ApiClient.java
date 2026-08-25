package library.client;

public class ApiClient {
    public String fetch(String key) {
        return key;
    }

    public void send(String left, String right) {
    }

    public static String normalize(String value) {
        return value.trim();
    }

    public boolean unchanged(int value) {
        return value > 0;
    }
}
