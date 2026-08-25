import { z } from "zod";
import { readWorkspaceTextFile } from "../tools/paths.js";

const expectedChangedMethodSchema = z.object({
  changeType: z.enum([
    "method_signature_changed",
    "method_added",
    "method_removed",
  ]),
  oldSymbol: z.string().optional(),
  newSymbol: z.string().optional(),
});

const expectedCallSiteSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  matchedSymbol: z.string(),
});

const benchmarkFixtureSchema = z.object({
  id: z.string(),
  scenario: z.string(),
  libraryPairs: z.array(
    z.object({
      oldFile: z.string(),
      newFile: z.string(),
    }),
  ),
  appRoot: z.string(),
  expected: z
    .object({
      changedMethods: z.array(expectedChangedMethodSchema),
      affectedCallSites: z.array(expectedCallSiteSchema),
    })
    .optional(),
});

export type BenchmarkFixture = z.infer<typeof benchmarkFixtureSchema>;

const fixtureManifests = new Map<string, string>([
  ["adversarial-java", "fixtures/adversarial-java/manifest.json"],
  ["order-platform-large", "fixtures/order-platform-large/manifest.json"],
]);

export async function loadBenchmarkFixture(id: string): Promise<BenchmarkFixture> {
  const manifestPath = fixtureManifests.get(id);

  if (!manifestPath) {
    throw new Error(`Unknown benchmark fixture: ${id}`);
  }

  return benchmarkFixtureSchema.parse(
    JSON.parse(
      await readWorkspaceTextFile(manifestPath, {
        extension: ".json",
      }),
    ),
  );
}
