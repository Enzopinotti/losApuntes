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

test("organization content reports use authenticated, encoded report routes", async () => {
  const requests: Array<{ path: string; options: unknown }> = [];
  const client = {
    request: async (path: string, options: unknown) => {
      requests.push({ path, options });
      return { report: { id: "report-1", reason: "spam", status: "pending" } };
    },
  } as unknown as MobileApiClient;
  const transport = new MobileOrganizationsHttpTransport(client);

  await transport.reportPost("session-token", "org/1", "post/2", {
    reason: "spam",
    details: "Contenido repetido",
  });
  await transport.reportEvent("session-token", "org/1", "event/3", {
    reason: "inappropriate",
  });

  assert.deepEqual(requests, [
    {
      path: "/organizations/org%2F1/posts/post%2F2/reports",
      options: {
        method: "POST",
        body: { reason: "spam", details: "Contenido repetido" },
        credential: "session-token",
      },
    },
    {
      path: "/organizations/org%2F1/events/event%2F3/reports",
      options: {
        method: "POST",
        body: { reason: "inappropriate" },
        credential: "session-token",
      },
    },
  ]);
});
