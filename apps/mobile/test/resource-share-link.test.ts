import assert from "node:assert/strict";
import test from "node:test";

import { buildMobileResourceSharePayload } from "../src/features/resources/resource-share-link";

const resourceId = "40e5593b-3d2c-4df8-a7f3-030829f201c4";

test("resource share payload contains only a validated app route and title", () => {
  assert.deepEqual(
    buildMobileResourceSharePayload({
      id: resourceId,
      title: "Álgebra lineal",
    }),
    {
      title: "Álgebra lineal",
      url: `losapuntes:///resources/${resourceId}`,
      message: `Álgebra lineal\nlosapuntes:///resources/${resourceId}`,
    },
  );
});

test("resource share rejects malformed IDs and unsafe titles", () => {
  assert.equal(
    buildMobileResourceSharePayload({ id: "not-a-uuid", title: "Álgebra" }),
    null,
  );
  assert.equal(
    buildMobileResourceSharePayload({
      id: `${resourceId}?signedUrl=https://example.invalid/file`,
      title: "Álgebra",
    }),
    null,
  );
  assert.equal(
    buildMobileResourceSharePayload({ id: resourceId, title: "  \u202e  " }),
    null,
  );
  assert.equal(
    buildMobileResourceSharePayload({
      id: resourceId,
      title: "Álgebra ".repeat(36),
    }),
    null,
  );
});

test("resource share title strips control and bidirectional formatting", () => {
  const payload = buildMobileResourceSharePayload({
    id: resourceId.toUpperCase(),
    title: "Álgebra\u202e\nlineal",
  });
  assert.equal(payload?.title, "Álgebra lineal");
  assert.equal(payload?.url, `losapuntes:///resources/${resourceId}`);
});
