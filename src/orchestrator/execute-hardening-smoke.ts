import { config } from "../config.js";
import { executeTypeScript } from "./execute.js";

async function main(): Promise<void> {
  const good = await executeTypeScript({
    code: `
      console.log("captured");
      const size: number = await jsonByteSize({ value: { ok: true } });
      return { size, ok: true };
    `,
  });

  assert(good.ok, `expected valid generated code to execute: ${good.error}`);
  assert(good.logs?.[0] === "captured", "expected console output capture");
  assert(
    (good.result as { size: number }).size === 11,
    "expected host helper binding to return byte size",
  );
  assert(
    good.sandbox.engine === "isolated-vm",
    "expected sandbox metadata to report the isolate engine",
  );
  assert(
    good.sandbox.timeoutMs === config.sandbox.timeoutMs,
    "expected sandbox metadata to use the single runtime config",
  );

  const hostGlobals = await executeTypeScript({
    code: `
      return {
        process: typeof process,
        require: typeof require,
        fetch: typeof fetch,
        buffer: typeof Buffer,
      };
    `,
  });
  assert(hostGlobals.ok, "expected host-global probe to execute");
  const probes = hostGlobals.result as Record<string, string>;

  for (const [name, type] of Object.entries(probes)) {
    assert(type === "undefined", `expected host global ${name} to be absent from isolate`);
  }

  const constructorEscape = await executeTypeScript({
    code: `
      const escaped = await jsonByteSize.constructor("return typeof process")();
      return { escaped };
    `,
  });
  assert(constructorEscape.ok, "expected constructor escape probe to execute");
  assert(
    (constructorEscape.result as { escaped: string }).escaped === "undefined",
    "expected constructor escape to stay inside the isolate",
  );

  const oversized = await executeTypeScript({
    code: `return "x".repeat(${config.sandbox.outputLimitBytes + 1});`,
  });
  assert(!oversized.ok, "expected oversized result to be rejected");
  assert(
    oversized.error?.includes("exceeding output limit"),
    "expected output limit error",
  );

  const infiniteLoop = await executeTypeScript({
    code: "while (true) {} return 1;",
  });
  assert(!infiniteLoop.ok, "expected infinite loop to be terminated");

  const oversizedCode = await executeTypeScript({
    code: `return "${"x".repeat(config.sandbox.maxCodeBytes + 1)}";`,
  });
  assert(!oversizedCode.ok, "expected oversized code to be rejected");
  assert(
    oversizedCode.error?.includes("exceeding limit"),
    "expected code size limit error",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          "valid execution with typed code",
          "console capture",
          "host binding round-trip",
          "host globals absent",
          "constructor escape contained",
          "output limit from config",
          "infinite loop timeout from config",
          "code size limit from config",
        ],
        config: config.sandbox,
      },
      null,
      2,
    ),
  );
}

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
