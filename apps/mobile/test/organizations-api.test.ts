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

test("organization content reports use authenticated, encoded report routes", async () => {
  const requests: Array<{ path: string; options: unknown }> = [];
  const client = {
    request: async (path: string, options: unknown) => {
      requests.push({ path, options });
      return { report: { id: "report-1", status: "pending" } };
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
