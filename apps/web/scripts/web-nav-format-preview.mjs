import { readFileSync } from "node:fs";
import prettier from "prettier";

const path = "src/layouts/Layout.tsx";
const formatted = await prettier.format(readFileSync(path, "utf8"), {
  ...(await prettier.resolveConfig(path)),
  filepath: path,
});
const parts = (encodeURIComponent(formatted).match(/.{1,1200}/gu) ?? []);
for (let i = 0; i < parts.length; i += 1) {
  console.log(`WEBNAVFMT|${i}|${parts.length}|${parts[i]}`);
}
