import { readFileSync } from "node:fs";
import prettier from "prettier";

const path = "src/features/community/community-context-next-step.ts";
const original = readFileSync(path, "utf8");
const formatted = await prettier.format(original, {
  ...(await prettier.resolveConfig(path)),
  filepath: path,
});
console.log("BEGIN_PRETTIER_OUTPUT");
console.log(formatted);
console.log("END_PRETTIER_OUTPUT");
