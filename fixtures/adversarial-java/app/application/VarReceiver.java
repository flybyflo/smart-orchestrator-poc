package application;

import library.client.ApiClient;

public class VarReceiver {
    public String fetch() {
        var client = new ApiClient();
        return client.fetch("value");
    }
}
