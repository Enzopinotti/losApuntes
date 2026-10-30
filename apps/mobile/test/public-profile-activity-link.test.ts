import assert from "node:assert/strict";
import test from "node:test";

import { publicProfileActivityExternalUrl } from "../src/features/search/public-profile-activity-link-policy";

test("public activity links accept bounded HTTPS addresses without credentials", () => {
  assert.equal(
    publicProfileActivityExternalUrl("https://project.example.test/work"),
    "https://project.example.test/work",
  );
  assert.equal(
    publicProfileActivityExternalUrl("HTTPS://project.example.test/work"),
    "https://project.example.test/work",
  );
});

test("public activity links reject non-HTTPS, malformed, credentialed and oversized URLs", () => {
  assert.equal(
    publicProfileActivityExternalUrl("http://example.test/work"),
    null,
  );
  assert.equal(publicProfileActivityExternalUrl("javascript:alert(1)"), null);
  assert.equal(publicProfileActivityExternalUrl("data:text/plain,hello"), null);
  assert.equal(
    publicProfileActivityExternalUrl("https://user:secret@example.test/work"),
    null,
  );
  assert.equal(publicProfileActivityExternalUrl("https://"), null);
  assert.equal(
    publicProfileActivityExternalUrl(`https://${"a".repeat(2040)}.test/work`),
    null,
  );
  assert.equal(publicProfileActivityExternalUrl(null), null);
});

test("public activity URLs reject control characters that URL parsing can normalize", () => {
  for (const url of [
    " https://example.test/work",
    "https://example.test/work\nother",
    "https://example.test/work\tother",
    "https://example.test/%0a\r",
    "https://example.test/with space",
  ]) {
    assert.equal(publicProfileActivityExternalUrl(url), null, url);
  }
});
