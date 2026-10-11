import { readFileSync } from "node:fs";
import prettier from "prettier";

const paths = [
  "src/features/home/home-controller.ts",
  "test/home-controller.test.ts",
  "test/authenticated-api.test.ts",
];
for (const path of paths) {
  const formatted = await prettier.format(readFileSync(path, "utf8"), {
    ...(await prettier.resolveConfig(path)),
    filepath: path,
  });
  const encoded = encodeURIComponent(formatted);
  const parts = encoded.match(/.{1,1400}/gu) ?? [];
  for (let i = 0; i < parts.length; i += 1) {
    console.log(`HOMEFMT|${path}|${i}|${parts.length}|${parts[i]}`);
  }
}
