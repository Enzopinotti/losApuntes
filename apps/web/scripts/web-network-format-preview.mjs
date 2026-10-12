import { readFileSync } from "node:fs";
import prettier from "prettier";

const files = [
  "src/features/community/network-presentation.ts",
  "src/pages/Network.tsx",
];
for (let j = 0; j < files.length; j += 1) {
  const path = files[j];
  const code = await prettier.format(readFileSync(path, "utf8"), {
    ...(await prettier.resolveConfig(path)),
    filepath: path,
  });
  const encoded = encodeURIComponent(code);
  const parts = encoded.match(/.{1,1100}/gu) ?? [];
  for (let i = 0; i < parts.length; i += 1) {
    console.log(`WEBNETFMT|${j}|${i}|${parts.length}|${parts[i]}`);
  }
}
