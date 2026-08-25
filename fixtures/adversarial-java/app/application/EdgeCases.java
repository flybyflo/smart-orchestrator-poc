package application;

import library.client.ApiClient;

public class EdgeCases {
    private final ApiClient client = new ApiClient();

    public String multilineFetch() {
        return client
            .fetch(
                "value, with (punctuation)"
            );
    }

    public void nestedArguments() {
        client.send("left,right", helper("nested, value"));
    }

    public String staticCall() {
        return ApiClient.normalize("""
            text, with (parentheses)
            and client.fetch("fake")
            """);
    }

    public void commentAndStringTraps() {
        // client.fetch("comment");
        /*
         * client.send("fake", "call");
         * ApiClient.normalize("fake");
         */
        String fake = "client.fetch(\"not a call\")";
    }

    private String helper(String value) {
        return value;
    }
}
