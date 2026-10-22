import assert from "node:assert/strict";
import test from "node:test";

import { MobileOrganizationsHttpTransport } from "../src/features/organizations/organizations-api";
import type { MobileApiClient } from "../src/services/api/client";

test("organization search sends its verification filter to the API", async () => {
  const requests: string[] = [];
  const client = {
    request: async (path: string) => {
      requests.push(path);
      return { items: [], nextCursor: null };
    },
  } as unknown as MobileApiClient;
  const transport = new MobileOrganizationsHttpTransport(client);

  await transport.search("session-token", {
    verificationState: "verified",
  });

  assert.deepEqual(requests, [
    "/organizations?limit=25&verificationState=verified",
  ]);
});
