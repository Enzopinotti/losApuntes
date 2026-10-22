import assert from "node:assert/strict";
import { publicProfileActivityLink } from "../apps/web/src/features/profile/public-profile-activity-link.ts";

assert.deepEqual(
  publicProfileActivityLink("https://project.example.test/work"),
  {
    href: "https://project.example.test/work",
    hostname: "project.example.test",
  },
);
assert.deepEqual(
  publicProfileActivityLink("HTTPS://project.example.test/work"),
  {
    href: "https://project.example.test/work",
    hostname: "project.example.test",
  },
);
assert.equal(publicProfileActivityLink("http://example.test/work"), null);
assert.equal(publicProfileActivityLink("javascript:alert(1)"), null);
assert.equal(publicProfileActivityLink("data:text/plain,hello"), null);
assert.equal(
  publicProfileActivityLink("https://user:secret@example.test/work"),
  null,
);
assert.equal(publicProfileActivityLink("https://"), null);
assert.equal(
  publicProfileActivityLink(`https://${"a".repeat(2040)}.test/work`),
  null,
);
assert.equal(publicProfileActivityLink(null), null);

console.log("PASS Web public profile activity link URL policy");
