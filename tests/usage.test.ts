import assert from "node:assert/strict";
import test from "node:test";
import { tokenizeJava } from "../src/tools/java-lexical.js";
import { findJavaCallSites } from "../src/tools/usage.js";
import type { UsageSearchResult } from "../src/types.js";

let adversarialUsagePromise: Promise<UsageSearchResult> | undefined;

function adversarialUsage(): Promise<UsageSearchResult> {
  adversarialUsagePromise ??= findJavaCallSites({
    rootDirectory: "fixtures/adversarial-java/app",
    symbols: [
      {
        owner: "library.client.ApiClient",
        name: "fetch",
        parameterTypes: ["java.lang.String"],
        returnType: "java.lang.String",
        signature:
          "<library.client.ApiClient: java.lang.String fetch(java.lang.String)>",
      },
      {
        owner: "library.client.ApiClient",
        name: "send",
        parameterTypes: ["java.lang.String", "java.lang.String"],
        returnType: "void",
        signature:
          "<library.client.ApiClient: void send(java.lang.String,java.lang.String)>",
      },
      {
        owner: "library.client.ApiClient",
        name: "normalize",
        parameterTypes: ["java.lang.String"],
        returnType: "java.lang.String",
        signature:
          "<library.client.ApiClient: java.lang.String normalize(java.lang.String)>",
      },
    ],
  });

  return adversarialUsagePromise;
}

test("lexer discards line and block comments", () => {
  const values = tokenizeJava(`
    // client.fetch("fake");
    /* client.send("fake", "call"); */
    client.fetch("real");
  `).map((token) => token.value);

  assert.equal(values.filter((value) => value === "fetch").length, 1);
  assert.equal(values.includes("send"), false);
});

test("lexer treats strings, characters, and text blocks as atomic literals", () => {
  const tokens = tokenizeJava(`
    use("a,b(c)", ',', """client.fetch("fake")""");
  `);

  assert.deepEqual(
    tokens.filter((token) => token.kind === "literal").map((token) => token.value),
    ["<string>", "<char>", "<text-block>"],
  );
  assert.equal(tokens.some((token) => token.value === "fetch"), false);
});

test("usage scanner finds calls split across lines", async () => {
  const usage = await adversarialUsage();
  assert.ok(
    usage.callSites.some(
      (site) => site.file.endsWith("EdgeCases.java") && site.line === 10,
    ),
  );
});

test("nested calls and punctuation inside strings preserve argument counts", async () => {
  const usage = await adversarialUsage();
  const send = usage.callSites.find((site) => site.matchedSymbol.name === "send");
  assert.equal(send?.argumentCount, 2);
});

test("comment, string, and text-block contents do not create fake calls", async () => {
  const usage = await adversarialUsage();
  const edgeSites = usage.callSites.filter((site) =>
    site.file.endsWith("EdgeCases.java"),
  );
  assert.deepEqual(edgeSites.map((site) => site.line), [10, 16, 20]);
});

test("lexical shadowing excludes the unrelated inner receiver", async () => {
  const usage = await adversarialUsage();
  const scopedSites = usage.callSites.filter((site) =>
    site.file.endsWith("ScopedReceivers.java"),
  );
  assert.deepEqual(scopedSites.map((site) => site.line), [14]);
});

test("same simple class names in different packages do not match", async () => {
  const usage = await adversarialUsage();
  assert.equal(
    usage.callSites.some((site) => site.file.includes("application/other")),
    false,
  );
});

test("static calls resolve through wildcard imports", async () => {
  const usage = await adversarialUsage();
  assert.ok(
    usage.callSites.some((site) => site.file.endsWith("WildcardStatic.java")),
  );
});

test("local var receivers infer their constructor type", async () => {
  const usage = await adversarialUsage();
  assert.ok(
    usage.callSites.some(
      (site) => site.file.endsWith("VarReceiver.java") && site.line === 8,
    ),
  );
});

test("resolved adversarial findings carry high-confidence type evidence", async () => {
  const usage = await adversarialUsage();
  assert.equal(usage.callSites.length, 6);
  assert.ok(usage.callSites.every((site) => site.confidence === "high"));
  assert.ok(
    usage.callSites.every((site) =>
      site.evidence.includes("library.client.ApiClient"),
    ),
  );
});
