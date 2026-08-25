import { analyzeUpgrade } from "./core/impact-analysis.js";

const result = await analyzeUpgrade({
  taskId: "parser-basic",
  oldFile: "fixtures/v1/library/Parser.java",
  newFile: "fixtures/v2/library/Parser.java",
  appRoot: "fixtures/app",
});

console.log(
  JSON.stringify(
    {
      ...result.report,
      telemetry: result.telemetry,
    },
    null,
    2,
  ),
);
