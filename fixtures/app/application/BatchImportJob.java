package application;

import library.Parser;

public class BatchImportJob {
    public int importRecord(String rawValue) {
        Parser parser = new Parser();
        return parser.parseInt(rawValue);
    }
}
