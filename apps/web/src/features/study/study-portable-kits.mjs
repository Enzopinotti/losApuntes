import {
  emptyStudySession,
  normalizeStudySession,
} from "./study-session-plan.mjs";

export const STUDY_KIT_FORMAT = "losapuntes.portable-study-kits";
export const STUDY_KIT_VERSION = 1;
export const STUDY_KIT_MAX_COLLECTIONS = 12;
export const STUDY_KIT_MAX_RESOURCES = 24;
export const STUDY_KIT_MAX_FILE_BYTES = 65536;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exact(input, keys) {
  return input && typeof input === "object" &&
    !Array.isArray(input) &&
    Object.keys(input).sort().join(",") === keys.slice().sort().join(",");
}

function uuid(input) {
  if (typeof input !== "string" || !UUID.test(input)) {
    invalid("STUDY_KIT_ID_INVALID");
  }
  return input.toLowerCase();
}

function text(input, cap, required) {
  if (typeof input !== "string") invalid("STUDY_KIT_TEXT_INVALID");
  const value = input.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    value.length > cap ||
    (required && value.length === 0) ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) invalid("STUDY_KIT_TEXT_INVALID");
  return value;
}

export function normalizeStudyKitArchive(input) {
  if (
    !exact(input, ["format", "version", "subjectId", "kits"]) ||
    input.format !== STUDY_KIT_FORMAT ||
    input.version !== STUDY_KIT_VERSION ||
    !Array.isArray(input.kits) ||
    input.kits.length > STUDY_KIT_MAX_COLLECTIONS
  ) invalid("STUDY_KIT_FORMAT_INVALID");
  const subjectId = uuid(input.subjectId);
  const kitsSeen = new Set();
  const kits = input.kits.map((kit) => {
    if (!exact(kit, ["id", "title", "notes", "resourceIds"])) {
      invalid("STUDY_KIT_FORMAT_INVALID");
    }
    const id = uuid(kit.id);
    if (kitsSeen.has(id)) invalid("STUDY_KIT_DUPLICATE");
    kitsSeen.add(id);
    const title = text(kit.title, 100, true);
    const notes = text(kit.notes, 500, false);
    if (
      !Array.isArray(kit.resourceIds) ||
      kit.resourceIds.length > STUDY_KIT_MAX_RESOURCES
    ) invalid("STUDY_KIT_RESOURCE_LIMIT");
    const resourceSeen = new Set();
    const resourceIds = kit.resourceIds.map((raw) => {
      const resourceId = uuid(raw);
      if (resourceSeen.has(resourceId)) invalid("STUDY_KIT_DUPLICATE");
      resourceSeen.add(resourceId);
      return resourceId;
    });
    return { id, title, notes, resourceIds };
  });
  return {
    format: STUDY_KIT_FORMAT,
    version: STUDY_KIT_VERSION,
    subjectId,
    kits,
  };
}

export function emptyStudyKitArchive(subjectId) {
  return normalizeStudyKitArchive({
    format: STUDY_KIT_FORMAT,
    version: STUDY_KIT_VERSION,
    subjectId,
    kits: [],
  });
}

export function readStudyKitArchive(source) {
  if (typeof source !== "string" || new TextEncoder().encode(source).length >
    STUDY_KIT_MAX_FILE_BYTES) invalid("STUDY_KIT_FILE_TOO_LARGE");
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    invalid("STUDY_KIT_JSON_INVALID");
  }
  return normalizeStudyKitArchive(parsed);
}

export function serializeStudyKitArchive(archive) {
  const content = JSON.stringify(normalizeStudyKitArchive(archive), null, 2) + "\n";
  if (new TextEncoder().encode(content).length > STUDY_KIT_MAX_FILE_BYTES) {
    invalid("STUDY_KIT_FILE_TOO_LARGE");
  }
  return content;
}

export function createStudyKit(archive, input) {
  const current = normalizeStudyKitArchive(archive);
  if (current.kits.length >= STUDY_KIT_MAX_COLLECTIONS) {
    invalid("STUDY_KIT_COLLECTION_LIMIT");
  }
  if (!exact(input, ["id", "title", "notes"])) {
    invalid("STUDY_KIT_FORMAT_INVALID");
  }
  return normalizeStudyKitArchive({
    ...current,
    kits: [...current.kits, {...input, resourceIds: []}],
  });
}

export function changeStudyKit(archive, kitId, changes) {
  const current = normalizeStudyKitArchive(archive);
  const target = uuid(kitId);
  if (!changes || typeof changes !== "object" || Array.isArray(changes) ||
    Object.keys(changes).some((key) => !["title","notes"].includes(key))
  ) invalid("STUDY_KIT_FORMAT_INVALID");
  const updated = current.kits.map((kit) =>
    kit.id !== target ? kit : { ...kit, ...changes },
  );
  if (!current.kits.some((kit) => kit.id === target)) {
    invalid("STUDY_KIT_NOT_FOUND");
  }
  return normalizeStudyKitArchive({ ...current, kits: updated });
}

export function deleteStudyKit(archive, kitId) {
  const current = normalizeStudyKitArchive(archive);
  const target = uuid(kitId);
  if (!current.kits.some((kit) => kit.id === target)) {
    invalid("STUDY_KIT_NOT_FOUND");
  }
  return { ...current, kits: current.kits.filter((kit) => kit.id !== target) };
}

export function addStudyKitResource(archive, kitId, resourceId) {
  const current = normalizeStudyKitArchive(archive);
  const id = uuid(kitId);
  const itemId = uuid(resourceId);
  let found = false;
  const updated = current.kits.map((kit) => {
    if (kit.id !== id) return kit;
    found = true;
    if (kit.resourceIds.includes(itemId)) return kit;
    if (kit.resourceIds.length >= STUDY_KIT_MAX_RESOURCES) {
      invalid("STUDY_KIT_RESOURCE_LIMIT");
    }
    return { ...kit, resourceIds: [...kit.resourceIds, itemId] };
  });
  if (!found) invalid("STUDY_KIT_NOT_FOUND");
  return normalizeStudyKitArchive({ ...current, kits: updated });
}

export function removeStudyKitResource(archive, kitId, resourceId) {
  const current = normalizeStudyKitArchive(archive);
  const id = uuid(kitId);
  const itemId = uuid(resourceId);
  if (!current.kits.some((kit) => kit.id === id)) invalid("STUDY_KIT_NOT_FOUND");
  return {
    ...current,
    kits: current.kits.map((kit) =>
      kit.id === id
        ? { ...kit, resourceIds: kit.resourceIds.filter((value) => value !== itemId) }
        : kit,
    ),
  };
}

export function moveStudyKitResource(archive, kitId, index, delta) {
  const current = normalizeStudyKitArchive(archive);
  const id = uuid(kitId);
  if (!Number.isSafeInteger(index) || ![-1,1].includes(delta)) {
    invalid("STUDY_KIT_POSITION_INVALID");
  }
  if (!current.kits.some((kit) => kit.id === id)) invalid("STUDY_KIT_NOT_FOUND");
  return {
    ...current,
    kits: current.kits.map((kit) => {
      if (kit.id !== id) return kit;
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= kit.resourceIds.length) {
        invalid("STUDY_KIT_POSITION_INVALID");
      }
      const list = [...kit.resourceIds];
      [list[index],list[nextIndex]] = [list[nextIndex],list[index]];
      return { ...kit, resourceIds: list };
    }),
  };
}

export function studyKitToSession(archive, kitId) {
  const current = normalizeStudyKitArchive(archive);
  const kit = current.kits.find((value) => value.id === uuid(kitId));
  if (!kit) invalid("STUDY_KIT_NOT_FOUND");
  if (!kit.resourceIds.length) invalid("STUDY_KIT_EMPTY");
  return normalizeStudySession({
    ...emptyStudySession(current.subjectId),
    title: kit.title,
    notes: kit.notes,
    tasks: kit.resourceIds.map((id) => ({
      kind: "resource",
      id,
      minutes: 20,
      done: false,
    })),
  });
}
