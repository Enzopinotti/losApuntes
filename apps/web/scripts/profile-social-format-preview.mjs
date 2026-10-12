import { readFileSync } from "node:fs";
import prettier from "prettier";
const files = [
  "src/features/community/public-profile-social-actions.tsx",
  "src/pages/PublicProfile.tsx",
];
for (let k = 0; k < files.length; k += 1) {
  const file = files[k];
  const text = await prettier.format(readFileSync(file, "utf8"), {
    ...(await prettier.resolveConfig(file)),
    filepath: file,
  });
  const encoded = encodeURIComponent(text);
  const chunks = encoded.match(/.{1,1100}/gu) ?? [];
  for (let i = 0; i < chunks.length; i += 1) {
    console.log(`PUBPROFILEFMT|${k}|${i}|${chunks.length}|${chunks[i]}`);
  }
}
