/**
 * Owner-scoped, fail-closed recovery for broken private collection references.
 * Scanning never mutates data; clean-up only removes existing references,
 * never original resources. Backend authentication remains authoritative.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_ITEMS = 100;
const PAGE_SIZE = 25;
const MAX_PAGES = Math.ceil(MAX_ITEMS / PAGE_SIZE);

export class CollectionRecoveryError extends Error {
  constructor(code, progress, cause) {
    super(code);
    this.name = "CollectionRecoveryError";
    this.code = code;
    this.progress = progress;
    this.failure = cause;
  }
}

function active(signal) {
  if (signal?.aborted) throw new Error("RECOVERY_ABORTED");
}
function validId(id) {
  if (typeof id !== "string" || !UUID.test(id)) {
    throw new Error("RECOVERY_ID_INVALID");
  }
  return id.toLowerCase();
}
function checkRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("RECOVERY_RESPONSE_INVALID");
  }
}
function verifyHeader(data, collectionId) {
  const c = data?.collection;
  if (!c || validId(c.id) !== collectionId) {
    throw new Error("RECOVERY_RESPONSE_INVALID");
  }
  checkRevision(c.revision);
  if (!Number.isSafeInteger(c.resourceCount) ||
      c.resourceCount < 0 || c.resourceCount > MAX_ITEMS) {
    throw new Error("RECOVERY_RESPONSE_INVALID");
  }
  return c;
}
function notify(onProgress, progress, signal) {
  if (!signal?.aborted && typeof onProgress === "function") {
    onProgress({ ...progress });
  }
}

export async function inspectCollectionHealth(collectionId, api, signal, onProgress) {
  const id = validId(collectionId);
  if (!api || typeof api.get !== "function" || typeof api.resources !== "function") {
    throw new Error("RECOVERY_API_INVALID");
  }
  const progress = {
    collectionId: id,
    revision: null,
    inspected: 0,
    total: null,
    missingIds: [],
    pages: 0,
  };
  try {
    active(signal);
    const header = verifyHeader(await api.get(id, signal), id);
    active(signal);
    progress.total = header.resourceCount;
    progress.revision = header.revision;
    let cursor = undefined;
    const cursorSeen = new Set();
    const idSeen = new Set();
    do {
      active(signal);
      if (progress.pages >= MAX_PAGES) {
        throw new Error("RECOVERY_PAGE_OVERFLOW");
      }
      const page = await api.resources(id, cursor, signal);
      active(signal);
      if (!page || page.revision !== progress.revision ||
          !Array.isArray(page.items) || page.items.length > PAGE_SIZE ||
          (typeof page.nextCursor !== "string" && page.nextCursor !== null)) {
        throw new Error("RECOVERY_REVISION_OR_PAGE_INVALID");
      }
      // An empty page with a next cursor, a repeated token, or duplicate IDs
      // could otherwise falsely appear to be a complete owner scan.
      if (page.nextCursor && (page.items.length === 0 ||
          cursorSeen.has(page.nextCursor))) {
        throw new Error("RECOVERY_CURSOR_LOOP");
      }
      for (const item of page.items) {
        if (!item || validId(item.resourceId) !== item.resourceId.toLowerCase() ||
            (item.resource !== null &&
              (typeof item.resource !== "object" ||
               validId(item.resource.id) !== item.resourceId.toLowerCase())) ||
            idSeen.has(item.resourceId.toLowerCase())) {
          throw new Error("RECOVERY_RESPONSE_INVALID");
        }
        idSeen.add(item.resourceId.toLowerCase());
        if (item.resource === null) progress.missingIds.push(item.resourceId);
      }
      progress.inspected = idSeen.size;
      progress.pages += 1;
      if (progress.inspected > MAX_ITEMS || progress.inspected > progress.total) {
        throw new Error("RECOVERY_COUNT_INVALID");
      }
      if (page.nextCursor) cursorSeen.add(page.nextCursor);
      cursor = page.nextCursor || undefined;
      notify(onProgress, progress, signal);
    } while (cursor);

    const after = verifyHeader(await api.get(id, signal), id);
    active(signal);
    if (after.revision !== progress.revision ||
        after.resourceCount !== progress.total ||
        progress.inspected !== progress.total) {
      throw new Error("RECOVERY_STALE_SCAN");
    }
    return {
      collectionId: id,
      revision: progress.revision,
      total: progress.total,
      inspected: progress.inspected,
      missingIds: progress.missingIds.slice(),
      accessible: progress.total - progress.missingIds.length,
      pages: progress.pages,
    };
  } catch (error) {
    throw new CollectionRecoveryError(
      signal?.aborted ? "RECOVERY_ABORTED" : "RECOVERY_SCAN_INCOMPLETE",
      { ...progress, missingIds: progress.missingIds.slice() },
      error,
    );
  }
}

/**
 * Requires a completed, owner-scoped scan as input. The re-check of each
 * reference and revision is intentionally serial to avoid destructive races.
 * A restored resource is preserved. A revision conflict stops the entire
 * operation and requires a new scan and confirmation.
 */
export async function repairMissingReferences(report, api, signal, onProgress) {
  const id = validId(report?.collectionId);
  checkRevision(report?.revision);
  if (!Number.isSafeInteger(report?.total) || report.total < 0 ||
      report.total > MAX_ITEMS || report.inspected !== report.total ||
      !Array.isArray(report.missingIds) ||
      report.missingIds.length > report.total ||
      new Set(report.missingIds).size !== report.missingIds.length ||
      report.missingIds.some((rid) => !UUID.test(rid))) {
    throw new Error("RECOVERY_REPORT_INVALID");
  }
  if (!api || typeof api.get !== "function" ||
      typeof api.readResource !== "function" ||
      typeof api.remove !== "function") {
    throw new Error("RECOVERY_API_INVALID");
  }
  const progress = {
    collectionId: id,
    revision: report.revision,
    total: report.missingIds.length,
    processed: 0,
    removed: 0,
    restored: 0,
  };
  try {
    for (const resourceId of report.missingIds) {
      active(signal);
      const header = verifyHeader(await api.get(id, signal), id);
      active(signal);
      if (header.revision !== progress.revision) {
        throw new Error("RECOVERY_STALE_REVISION");
      }
      try {
        const available = await api.readResource(resourceId, signal);
        active(signal);
        if (!available?.resource || validId(available.resource.id) !== resourceId.toLowerCase()) {
          throw new Error("RECOVERY_RESOURCE_RESPONSE_INVALID");
        }
        // Access was restored since the scan. Never delete this reference.
        progress.restored += 1;
      } catch (error) {
        active(signal);
        if (error?.status === 403 || error?.status === 404) {
          // The server checks ownership, current Resource accessibility,
          // and performs revision CAS in the Mongo transaction. A stale
          // revision must fail without deleting a newly modified reference.
          const result = await api.remove(
            id, resourceId, signal, progress.revision,
          );
          active(signal);
          if (!result?.collection ||
              validId(result.collection.id) !== id ||
              result.collection.revision !== progress.revision + 1) {
            throw new Error("RECOVERY_WRITE_RESULT_INVALID");
          }
          progress.revision = result.collection.revision;
          progress.removed += 1;
        } else {
          throw error;
        }
      }
      progress.processed += 1;
      notify(onProgress, progress, signal);
    }
    return { ...progress };
  } catch (error) {
    throw new CollectionRecoveryError(
      signal?.aborted ? "RECOVERY_ABORTED" : "RECOVERY_REPAIR_INCOMPLETE",
      { ...progress }, error,
    );
  }
}
