import assert from "node:assert/strict";
import test from "node:test";

import { ResourcePickedFileLease } from "../src/features/resources/resource-picked-file-lease";

test("releases an iOS picker copy once and only after the active transfer settles", async () => {
  let settleTransfer!: (value: unknown) => void;
  const transfer = new Promise((resolve) => {
    settleTransfer = resolve;
  });
  const deleted: string[] = [];
  const lease = new ResourcePickedFileLease(
    "file:///private/tmp/picked-notes.pdf",
    true,
    (uri) => deleted.push(uri),
  );

  const release = lease.releaseAfter(transfer);
  assert.deepEqual(deleted, []);
  settleTransfer(undefined);
  await release;

  assert.deepEqual(deleted, ["file:///private/tmp/picked-notes.pdf"]);
  assert.equal(lease.releaseAfter(), release);
  await lease.releaseAfter();
  assert.equal(deleted.length, 1);
});

test("releases an iOS picker copy after a failed transfer settles", async () => {
  let rejectTransfer!: (reason: Error) => void;
  const transfer = new Promise((_, reject) => {
    rejectTransfer = reject;
  });
  const deleted: string[] = [];
  const lease = new ResourcePickedFileLease(
    "file:///private/tmp/picked-notes.pdf",
    true,
    (uri) => deleted.push(uri),
  );
  const release = lease.releaseAfter(transfer);

  rejectTransfer(new Error("aborted"));
  await release;

  assert.deepEqual(deleted, ["file:///private/tmp/picked-notes.pdf"]);
});

test("never deletes an Android provider-owned file URI", async () => {
  const deleted: string[] = [];
  const lease = new ResourcePickedFileLease(
    "content://provider/document/42",
    false,
    (uri) => deleted.push(uri),
  );

  await lease.releaseAfter();

  assert.deepEqual(deleted, []);
});
