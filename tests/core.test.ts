import assert from "node:assert/strict";
import test from "node:test";
import { analyzeUpgrade } from "../src/core/impact-analysis.js";
import {
  sandboxCapabilities,
  typeDefinitionsFor,
} from "../src/orchestrator/bindings.js";
import { executeTypeScript } from "../src/orchestrator/execute.js";
import { parseJavaSource } from "../src/tools/javaSymbols.js";
import { resolveWorkspacePath } from "../src/tools/paths.js";

test("canonical analysis returns the exact parser impact report", async () => {
  const { report } = await analyzeUpgrade({
    oldFile: "fixtures/v1/library/Parser.java",
    newFile: "fixtures/v2/library/Parser.java",
    appRoot: "fixtures/app",
  });

  assert.equal(report.adapter, "gumtree");
  assert.equal(report.normalizationAdapter, "java-source-signatures");
  assert.deepEqual(
    report.changedMethods.map((change) => [
      change.changeType,
      change.oldSymbol,
      change.newSymbol,
    ]),
    [
      [
        "method_signature_changed",
        "<library.Parser: java.lang.String parse(java.lang.String)>",
        "<library.Parser: java.lang.String parse(java.lang.String,boolean)>",
      ],
      [
        "method_removed",
        "<library.Parser: int parseInt(java.lang.String)>",
        undefined,
      ],
      [
        "method_added",
        undefined,
        "<library.Parser: boolean canParse(java.lang.String)>",
      ],
    ],
  );
  assert.deepEqual(
    report.affectedCallSites.map((site) => [site.file, site.line]),
    [
      ["fixtures/app/application/BatchImportJob.java", 8],
      ["fixtures/app/application/ExampleService.java", 8],
    ],
  );
});

test("Java parser keeps overloads distinct", () => {
  const parsed = parseJavaSource(`
    package example;
    class Client {
      public String load(String id) { return id; }
      public String load(
        String id,
        boolean fresh
      ) { return id; }
    }
  `);

  assert.deepEqual(
    parsed.methods.map((method) => method.symbol.signature),
    [
      "<example.Client: java.lang.String load(java.lang.String)>",
      "<example.Client: java.lang.String load(java.lang.String,boolean)>",
    ],
  );
});

test("workspace path boundary rejects absolute paths and traversal", async () => {
  await assert.rejects(resolveWorkspacePath("/etc/passwd"), /relative to the workspace/);
  await assert.rejects(
    resolveWorkspacePath("fixtures/../package.json"),
    /under one of|traversal/,
  );
});

test("capability registry validates runtime inputs and serves the matching contract", async () => {
  const gumtree = sandboxCapabilities.find(
    (capability) => capability.name === "gumtreeDiff",
  );
  assert.ok(gumtree);
  assert.match(
    typeDefinitionsFor(["gumtreeDiff"]),
    /normalizationAdapter: "java-source-signatures"/,
  );
  await assert.rejects(
    gumtree.invoke(
      { oldFile: "fixtures/v1/library/Parser.java" },
      {
        telemetry: {
          record() {},
          snapshot: () => [],
        },
      },
    ),
    /newFile/,
  );
});

test("parallel sandbox executions keep telemetry isolated", async () => {
  const [diffExecution, usageExecution] = await Promise.all([
    executeTypeScript({
      code: `
        const diff = await gumtreeDiff({
          oldFile: "fixtures/v1/library/Parser.java",
          newFile: "fixtures/v2/library/Parser.java",
        });
        return diff.changedSymbols.length;
      `,
    }),
    executeTypeScript({
      code: `
        const usage = await findJavaCallSites({
          rootDirectory: "fixtures/app",
          symbols: [{
            owner: "library.Parser",
            name: "parseInt",
            parameterTypes: ["java.lang.String"],
            returnType: "int",
            signature: "<library.Parser: int parseInt(java.lang.String)>",
          }],
        });
        return usage.callSites.length;
      `,
    }),
  ]);

  assert.equal(diffExecution.ok, true, diffExecution.error);
  assert.equal(usageExecution.ok, true, usageExecution.error);
  assert.deepEqual(
    diffExecution.telemetry.map((call) => call.name),
    ["gumtreeDiff"],
  );
  assert.deepEqual(
    usageExecution.telemetry.map((call) => call.name),
    ["findJavaCallSites"],
  );
});
