import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { constants } from "node:fs";
import { config } from "./config.js";
import { gumtreeDiff } from "./tools/gumtree.js";

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

const execFileAsync = promisify(execFile);
const checks: DoctorCheck[] = [];
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

checks.push({
  name: "Node.js",
  ok: nodeMajor >= 22,
  detail: process.version,
});
checks.push(await commandCheck("Java", "java", ["-version"]));
checks.push(await commandCheck("Maven", "mvn", ["--version"]));
checks.push(
  await fileCheck("GumTree wrapper", config.gumtree.wrapperPath, constants.X_OK),
);
checks.push(
  await fileCheck(
    "GumTree classpath",
    `${config.repoRoot}/tools/gumtree-cli/classpath.txt`,
    constants.R_OK,
  ),
);

try {
  const diff = await gumtreeDiff({
    oldFile: "fixtures/v1/library/Parser.java",
    newFile: "fixtures/v2/library/Parser.java",
  });
  checks.push({
    name: "GumTree execution",
    ok: diff.adapter === "gumtree",
    detail: `${diff.rawSizeBytes} raw bytes`,
  });
} catch (error) {
  checks.push({
    name: "GumTree execution",
    ok: false,
    detail: error instanceof Error ? error.message : String(error),
  });
}

console.log(JSON.stringify({ ok: checks.every((check) => check.ok), checks }, null, 2));

if (checks.some((check) => !check.ok)) {
  process.exitCode = 1;
}

async function commandCheck(
  name: string,
  command: string,
  args: string[],
): Promise<DoctorCheck> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 10_000,
    });
    const detail = `${stdout}\n${stderr}`.trim().split(/\r?\n/u)[0] ?? "available";
    return { name, ok: true, detail };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fileCheck(
  name: string,
  file: string,
  mode: number,
): Promise<DoctorCheck> {
  try {
    await access(file, mode);
    return { name, ok: true, detail: file };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
