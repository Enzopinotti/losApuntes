import assert from "node:assert/strict";
import test from "node:test";

import { ApiRequestError } from "../src/services/api/client";
import { MobileSearchQuickSaveController } from "../src/features/search/search-quick-save-controller";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("confirmed one-tap save marks only that resource as saved", async () => {
  const ids: string[] = [];
  const controller = new MobileSearchQuickSaveController({
    save: async (id) => {
      ids.push(id);
      return { saved: true };
    },
  });
  controller.setAuthority("account-a:context");
  assert.equal(await controller.save("account-a:context", "resource-a"), true);
  assert.deepEqual(ids, ["resource-a"]);
  assert.deepEqual(controller.getSnapshot().items["resource-a"], {
    state: "saved",
    failure: null,
  });
  assert.equal(controller.getSnapshot().items["resource-b"], undefined);
  assert.equal(await controller.save("account-a:context", "resource-a"), false);
  assert.deepEqual(ids, ["resource-a"]);
});

test("double tap while a PUT is pending issues exactly one call", async () => {
  const pending = deferred<{ saved: true }>();
  let calls = 0;
  const controller = new MobileSearchQuickSaveController({
    save: async () => {
      calls++;
      return pending.promise;
    },
  });
  controller.setAuthority("a");
  const first = controller.save("a", "resource-1");
  assert.equal(controller.getSnapshot().items["resource-1"]?.state, "saving");
  assert.equal(await controller.save("a", "resource-1"), false);
  pending.resolve({ saved: true });
  assert.equal(await first, true);
  assert.equal(calls, 1);
});

test("timeout after sending PUT remains uncertain and prevents blind retries", async () => {
  let calls = 0;
  const controller = new MobileSearchQuickSaveController({
    save: async () => {
      calls++;
      throw new ApiRequestError("timeout", null, "TIMEOUT", "Timeout");
    },
  });
  controller.setAuthority("a");
  assert.equal(await controller.save("a", "resource"), false);
  assert.deepEqual(controller.getSnapshot().items.resource, {
    state: "uncertain",
    failure: "timeout",
  });
  assert.equal(await controller.save("a", "resource"), false);
  assert.equal(calls, 1);
});

test("unexpected unacknowledged response does not masquerade as saved", async () => {
  const controller = new MobileSearchQuickSaveController({
    save: async () => ({ saved: false }) as unknown as { saved: true },
  });
  controller.setAuthority("a");
  assert.equal(await controller.save("a", "resource"), false);
  assert.equal(controller.getSnapshot().items.resource?.state, "uncertain");
});

test("definite authorization failure shows error and can be retried manually", async () => {
  let calls = 0;
  const controller = new MobileSearchQuickSaveController({
    save: async () => {
      calls++;
      if (calls === 1)
        throw new ApiRequestError("forbidden", 403, "FORBIDDEN", "Denied");
      return { saved: true };
    },
  });
  controller.setAuthority("a");
  assert.equal(await controller.save("a", "resource"), false);
  assert.equal(controller.getSnapshot().items.resource?.state, "error");
  assert.equal(await controller.save("a", "resource"), true);
  assert.equal(calls, 2);
});

test("changing account aborts save and never applies previous user's response", async () => {
  const pending = deferred<{ saved: true }>();
  let signal: AbortSignal | undefined;
  const controller = new MobileSearchQuickSaveController({
    save: async (_id, nextSignal) => {
      signal = nextSignal;
      return pending.promise;
    },
  });
  controller.setAuthority("account-a");
  const prior = controller.save("account-a", "private-to-a");
  controller.setAuthority("account-b");
  pending.resolve({ saved: true });
  assert.equal(await prior, false);
  assert.equal(signal?.aborted, true);
  assert.deepEqual(controller.getSnapshot(), {
    authorityKey: "account-b",
    items: {},
  });
  assert.equal(await controller.save("account-a", "private-to-a"), false);
});

test("leaving Search aborts pending operations and clears private status", async () => {
  const pending = deferred<{ saved: true }>();
  const controller = new MobileSearchQuickSaveController({
    save: async () => pending.promise,
  });
  controller.setAuthority("session");
  const operation = controller.save("session", "resource");
  controller.invalidate();
  pending.resolve({ saved: true });
  assert.equal(await operation, false);
  assert.deepEqual(controller.getSnapshot(), {
    authorityKey: null,
    items: {},
  });
});

test("different resources may save independently within the same account", async () => {
  const controller = new MobileSearchQuickSaveController({
    save: async () => ({ saved: true }),
  });
  controller.setAuthority("a");
  const results = await Promise.all([
    controller.save("a", "r1"),
    controller.save("a", "r2"),
  ]);
  assert.deepEqual(results, [true, true]);
  assert.equal(controller.getSnapshot().items.r1?.state, "saved");
  assert.equal(controller.getSnapshot().items.r2?.state, "saved");
});
