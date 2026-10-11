import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(new URL("../package.json", import.meta.url));
const prettier = require("prettier");
const files = [
  "src/features/community/community-screens.tsx",
  "src/features/community/qa-mutations-controller.ts",
  "test/community-api.test.ts",
  "test/qa-mutations-controller.test.ts",
];
const directory = mkdtempSync(join(tmpdir(), "qa-format-preview-"));
try {
  for (const [i, path] of files.entries()) {
    const original = readFileSync(path, "utf8");
    const options = (await prettier.resolveConfig(path)) ?? {};
    const formatted = await prettier.format(original, { ...options, filepath: path });
    if (formatted === original) continue;
    const before = join(directory, "before-" + i);
    const after = join(directory, "after-" + i);
    writeFileSync(before, original);
    writeFileSync(after, formatted);
    const result = spawnSync(
      "diff",
      ["-u", "--label", path + " (original)", "--label", path + " (formatted)", before, after],
      { encoding: "utf8" },
    );
    console.log(result.stdout);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
