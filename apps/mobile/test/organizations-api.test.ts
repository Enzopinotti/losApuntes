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

test("organization upcoming events send the server date on the first page only", async () => {
  const requests: string[] = [];
  const client = {
    request: async (path: string) => {
      requests.push(path);
      return { items: [], nextCursor: null };
    },
  } as unknown as MobileApiClient;
  const transport = new MobileOrganizationsHttpTransport(client);

  await transport.events(
    "session-token",
    "organization/a",
    undefined,
    undefined,
    "2026-11-10T18:00:00.000Z",
  );
  await transport.events(
    "session-token",
    "organization/a",
    "next:opaque",
    undefined,
    "2026-11-10T18:00:00.000Z",
  );

  assert.equal(
    requests[0],
    "/organizations/organization%2Fa/events?limit=20&from=2026-11-10T18%3A00%3A00.000Z",
  );
  assert.equal(
    requests[1],
    "/organizations/organization%2Fa/events?limit=20&cursor=next%3Aopaque",
  );
});
