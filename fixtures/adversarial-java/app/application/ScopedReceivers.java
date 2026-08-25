package application;

import library.client.ApiClient;

public class ScopedReceivers {
    private final ApiClient client = new ApiClient();

    public String shadowed(String key) {
        {
            application.other.ApiClient client = new application.other.ApiClient();
            client.fetch(key);
        }

        return this.client.fetch(key);
    }
}
