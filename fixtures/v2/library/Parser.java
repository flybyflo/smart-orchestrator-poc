package library;

public class Parser {
    public String parse(String input, boolean strict) {
        String normalized = normalize(input);

        if (strict && normalized.isBlank()) {
            throw new IllegalArgumentException("Empty input");
        }

        return normalized;
    }

    public String normalize(String input) {
        if (input == null) {
            return "";
        }

        return input.trim();
    }

    public boolean canParse(String input) {
        return input != null && !input.isBlank();
    }
}
