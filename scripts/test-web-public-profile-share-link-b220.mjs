import assert from "node:assert/strict";
import { publicProfileShareUrl } from "../apps/web/src/features/profile/public-profile-share-link.ts";

const profileId = "b6d4cfc0-bf18-4fbe-83b4-10862c0cce1c";
assert.equal(
  publicProfileShareUrl(profileId, "https://losapuntes.example"),
  `https://losapuntes.example/p/${profileId}`,
);
assert.equal(
  publicProfileShareUrl(profileId.toUpperCase(), "http://localhost:5173"),
  `http://localhost:5173/p/${profileId.toUpperCase()}`,
);
assert.equal(
  publicProfileShareUrl("../admin", "https://losapuntes.example"),
  null,
);
assert.equal(publicProfileShareUrl(profileId, "javascript:alert(1)"), null);
assert.equal(
  publicProfileShareUrl(profileId, "https://user:secret@losapuntes.example"),
  null,
);

console.log("PASS Web public profile share URL policy");
