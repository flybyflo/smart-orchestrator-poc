package application;

import library.Parser;

public class ExampleService {
    public String handle(String value) {
        Parser parser = new Parser();
        return parser.parse(value);
    }

    public boolean accepts(String value) {
        return value != null && !value.isBlank();
    }
}
