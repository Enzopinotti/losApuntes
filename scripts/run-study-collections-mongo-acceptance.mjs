#!/usr/bin/env node
/**
 * B52: explicit, fail-closed acceptance entrypoint.
 * Never treats a Jest suite skipped for missing Mongo as a green gate.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateStudyMongoGateUri,
  validateStudyMongoJestReport,
} from "./lib/study-mongo-acceptance.mjs";

try {
  const uri = validateStudyMongoGateUri(
    process.env.STUDY_COLLECTIONS_TEST_MONGO_URI,
  );
  const scratch = mkdtempSync(join(tmpdir(), "losapuntes-mongo-b52-"));
  try {
    const resultFile = join(scratch, "jest.json");
    const args = [
      "--filter", "@losapuntes/api",
      "exec", "jest",
      "--runInBand",
      "--runTestsByPath",
      "src/study-collections/mongo/study-collection-lifecycle.mongo-int.spec.ts",
      "--json",
      "--outputFile", resultFile,
    ];
    const run = spawnSync("pnpm", args, {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        STUDY_COLLECTIONS_TEST_MONGO_URI: uri,
      },
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    if (run.error || run.status !== 0) {
      throw new Error(
        `Mongo Jest command failed: ${run.error?.message ?? run.status ?? "terminated"}`,
      );
    }
    const json = JSON.parse(readFileSync(resultFile, "utf8"));
    const checked = validateStudyMongoJestReport(json);
    console.log(
      `PASS B52 real Mongo: ${checked.passed} tests, ${checked.required} required scenarios`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
} catch (error) {
  console.error(
    "FAIL B52 Mongo acceptance:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
