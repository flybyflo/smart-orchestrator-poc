package library;

public class Parser {
    public String parse(String input) {
        return normalize(input);
    }

    public int parseInt(String input) {
        return Integer.parseInt(normalize(input));
    }

    public String normalize(String input) {
        if (input == null) {
            return "";
        }

        return input.trim();
    }
}
