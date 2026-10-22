/**
 * Bridge a validated B44 portable kit into an owner-private persistent
 * collection. No local persistence, no metadata transfer and no erasure.
 *
 * The portable kit's existing UUID is the server idempotency operationKey:
 * retries after a timeout, remount or refresh always resolve the same owner
 * collection (provided its title/notes have not changed).
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_RESOURCES = 24;

export class StudyKitSyncError extends Error {
  constructor(message, progress, cause) {
    super(message);
    this.name = "StudyKitSyncError";
    this.progress = progress;
    this.failure = cause;
  }
}

export function validateStudyKitSyncInput(kit, subjectId) {
  if (
    !kit || typeof kit !== "object" || Array.isArray(kit) ||
    typeof subjectId !== "string" || !UUID_V4.test(subjectId) ||
    typeof kit.id !== "string" || !UUID_V4.test(kit.id) ||
    typeof kit.title !== "string" || !kit.title.trim() ||
    kit.title.length > 100 ||
    typeof kit.notes !== "string" || kit.notes.length > 500 ||
    !Array.isArray(kit.resourceIds) ||
    kit.resourceIds.length > MAX_RESOURCES ||
    kit.resourceIds.some((id) => typeof id !== "string" || !UUID_V4.test(id)) ||
    new Set(kit.resourceIds.map((id) => id.toLowerCase())).size !== kit.resourceIds.length
  ) throw new Error("STUDY_KIT_SYNC_INVALID");
  return {
    operationKey: kit.id.toLowerCase(),
    title: kit.title,
    description: kit.notes,
    resourceIds: kit.resourceIds.map((id) => id.toLowerCase()),
    subjectId: subjectId.toLowerCase(),
  };
}

function assertSignal(signal) {
  if (signal?.aborted) throw new Error("STUDY_KIT_SYNC_ABORTED");
}

/**
 * The server is always authoritative for creating collections and attaching
 * resources. readResource is only a preflight gate: the PUT revalidates.
 * All writes remain behind the backend feature guard + owner ACL.
 */
export async function syncStudyKitToCollection(input, api, signal, onProgress) {
  const plan = validateStudyKitSyncInput(input.kit, input.subjectId);
  if (
    !api || typeof api.createCollection !== "function" ||
    typeof api.readResource !== "function" ||
    typeof api.addResource !== "function"
  ) throw new Error("STUDY_KIT_SYNC_API_INVALID");

  const progress = {
    collectionId: null,
    total: plan.resourceIds.length,
    linked: 0,
    skipped: 0,
  };
  const notify = () => {
    if (!signal?.aborted && typeof onProgress === "function") {
      onProgress({ ...progress });
    }
  };
  try {
    assertSignal(signal);
    const response = await api.createCollection({
      operationKey: plan.operationKey,
      title: plan.title,
      description: plan.description,
    }, signal);
    assertSignal(signal);
    if (!response?.collection?.id || !UUID_V4.test(response.collection.id)) {
      throw new Error("STUDY_KIT_SYNC_RESPONSE_INVALID");
    }
    progress.collectionId = response.collection.id;
    notify();

    for (const resourceId of plan.resourceIds) {
      assertSignal(signal);
      let resource;
      try {
        const result = await api.readResource(resourceId, signal);
        assertSignal(signal);
        resource = result?.resource;
      } catch (error) {
        assertSignal(signal);
        if (error && (error.status === 403 || error.status === 404)) {
          progress.skipped += 1;
          notify();
          continue;
        }
        throw error;
      }
      if (
        resource?.id?.toLowerCase() !== resourceId ||
        resource?.academic?.subject?.id?.toLowerCase() !== plan.subjectId
      ) {
        progress.skipped += 1;
        notify();
        continue;
      }
      // Per-resource PUT is idempotent. A retry safely continues the same
      // collection rather than creating a second one on another device.
      assertSignal(signal);
      await api.addResource(progress.collectionId, resourceId, signal);
      assertSignal(signal);
      progress.linked += 1;
      notify();
    }
    return { ...progress };
  } catch (error) {
    throw new StudyKitSyncError(
      signal?.aborted ? "STUDY_KIT_SYNC_ABORTED" : "STUDY_KIT_SYNC_INCOMPLETE",
      { ...progress },
      error,
    );
  }
}
