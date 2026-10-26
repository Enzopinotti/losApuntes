import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { organizationPublicPath } from "../apps/web/src/features/organizations/organization-public-share.mjs";

const id = "123e4567-e89b-42d3-a456-426614174000";

test("only stable v4 IDs produce shareable paths", () => {
  assert.equal(organizationPublicPath(id), `/organizations/${id}`);
  assert.equal(
    organizationPublicPath(id.toUpperCase()),
    `/organizations/${id}`,
  );
  for (const invalid of [
    "",
    "../admin",
    "javascript:alert(1)",
    "/organizations/" + id,
    id + "?token=secret",
    "123e4567-e89b-12d3-a456-426614174000",
    "123e4567-e89b-42d3-7456-426614174000",
    null,
    undefined,
    {},
  ]) {
    assert.equal(organizationPublicPath(invalid), null);
  }
});

test("component shares only public route and offers two fallbacks", async () => {
  const component = await readFile(
    new URL("../apps/web/src/features/organizations/OrganizationPublicShareAction.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /organizationPublicPath\(organizationId\)/u);
  assert.match(component, /new URL\(path, window\.location\.origin\)/u);
  assert.match(component, /navigator\.share/u);
  assert.match(component, /navigator\.clipboard\?\.writeText/u);
  assert.match(component, /if \(!navigator\.clipboard\?\.writeText\)/u);
  assert.match(component, /error\.name === "AbortError"/u);
  assert.match(component, /disabled=\{pending\}/u);
  assert.match(component, /role=\{failed \? "alert" : "status"\}/u);
  assert.match(component, /readOnly/u);
  assert.match(component, /event\.currentTarget\.select\(\)/u);
  assert.doesNotMatch(component, /localStorage|sessionStorage|Authorization|document\.cookie/u);
});

test("current organization page shows share action without mutating permission guards", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../apps/web/src/pages/Organization.tsx", import.meta.url), "utf8"),
    readFile(new URL("../apps/web/src/pages/Organizations.scss", import.meta.url), "utf8"),
  ]);
  assert.match(page, /OrganizationPublicShareAction/u);
  assert.match(page, /key=\{organization\.id\}/u);
  assert.match(page, /organizationId=\{organization\.id\}/u);
  assert.match(page, /displayName=\{organization\.name\}/u);
  assert.match(page, /organization\.viewer\?\.managementRole/u);
  assert.match(page, /organizationsApi\.follow/u);
  assert.match(page, /organizationsApi\.unfollow/u);
  assert.match(styles, /\.organization-share-action/u);
  assert.match(styles, /\.organization-share-fallback input/u);
});
