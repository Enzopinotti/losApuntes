import assert from "node:assert/strict";
import test from "node:test";

import { mobileOrganizationPublicLink } from "../src/features/organizations/organization-public-share";

test("builds a Mobile deep link for a canonical organization UUIDv4", () => {
  assert.equal(
    mobileOrganizationPublicLink("123e4567-e89b-42d3-a456-426614174000"),
    "losapuntes:///organizations/123e4567-e89b-42d3-a456-426614174000",
  );
  assert.equal(
    mobileOrganizationPublicLink("123E4567-E89B-42D3-A456-426614174000"),
    "losapuntes:///organizations/123e4567-e89b-42d3-a456-426614174000",
  );
});

test("rejects arbitrary paths and UUIDs outside version four", () => {
  for (const id of [
    "../login",
    "https://example.test/organizations/1",
    "123e4567-e89b-12d3-a456-426614174000",
    "123e4567-e89b-42d3-7456-426614174000",
    "123e4567-e89b-42d3-a456-426614174000?next=/login",
    "",
  ]) {
    assert.equal(mobileOrganizationPublicLink(id), null);
  }
});
