package library.client;

public class ApiClient {
    public String fetch(String key, boolean fresh) {
        return fresh ? key.trim() : key;
    }

    public static String normalize(String value, String mode) {
        return "upper".equals(mode) ? value.toUpperCase() : value.trim();
    }

    public boolean ping() {
        return true;
    }

    public boolean unchanged(int value) {
        return value > 0;
    }
}
