export const STUDY_SESSION_FORMAT = "losapuntes.study-session";
export const STUDY_SESSION_VERSION = 1;
export const STUDY_SESSION_MAX_TASKS = 24;
export const STUDY_SESSION_MAX_MINUTES = 1200;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function cleanText(value, max, code) {
  if (typeof value !== "string") fail(code);
  const clean = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (clean.length > max || /[\u0000-\u001f\u007f]/u.test(clean)) fail(code);
  return clean;
}

function localDateTime(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !DATE_TIME.test(value)) {
    fail("STUDY_SESSION_START_INVALID");
  }
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== Number(value.slice(0, 4)) ||
    date.getMonth() + 1 !== Number(value.slice(5, 7)) ||
    date.getDate() !== Number(value.slice(8, 10)) ||
    date.getHours() !== Number(value.slice(11, 13)) ||
    date.getMinutes() !== Number(value.slice(14, 16))
  ) {
    fail("STUDY_SESSION_START_INVALID");
  }
  return value;
}

/**
 * Versioned owner-held study session. The portable file contains only
 * subject/resource/question UUIDs and user-authored plan data, never cached
 * content titles, file URLs, names, grants or tokens. Re-import MUST recheck
 * access through the authoritative API before rendering item labels.
 */
export function normalizeStudySession(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("STUDY_SESSION_INVALID");
  }
  if (
    !exactKeys(input, [
      "format", "version", "subjectId", "title", "notes", "startsAt", "tasks",
    ]) ||
    input.format !== STUDY_SESSION_FORMAT ||
    input.version !== STUDY_SESSION_VERSION ||
    typeof input.subjectId !== "string" ||
    !UUID_V4.test(input.subjectId)
  ) {
    fail("STUDY_SESSION_INVALID");
  }
  const title = cleanText(input.title, 100, "STUDY_SESSION_TITLE_INVALID");
  const notes = cleanText(input.notes, 500, "STUDY_SESSION_NOTES_INVALID");
  if (!title) fail("STUDY_SESSION_TITLE_INVALID");
  const startsAt = localDateTime(input.startsAt);
  if (!Array.isArray(input.tasks) || input.tasks.length > STUDY_SESSION_MAX_TASKS) {
    fail("STUDY_SESSION_TASKS_INVALID");
  }
  const known = new Set();
  let totalMinutes = 0;
  const tasks = input.tasks.map((task) => {
    if (
      !task || typeof task !== "object" || Array.isArray(task) ||
      !exactKeys(task, ["kind", "id", "minutes", "done"]) ||
      (task.kind !== "resource" && task.kind !== "question") ||
      typeof task.id !== "string" || !UUID_V4.test(task.id) ||
      !Number.isSafeInteger(task.minutes) ||
      task.minutes < 5 || task.minutes > 120 || task.minutes % 5 !== 0 ||
      typeof task.done !== "boolean"
    ) {
      fail("STUDY_SESSION_TASKS_INVALID");
    }
    const id = task.id.toLowerCase();
    const key = task.kind + ":" + id;
    if (known.has(key)) fail("STUDY_SESSION_TASKS_DUPLICATED");
    known.add(key);
    totalMinutes += task.minutes;
    return { kind: task.kind, id, minutes: task.minutes, done: task.done };
  });
  if (totalMinutes > STUDY_SESSION_MAX_MINUTES) {
    fail("STUDY_SESSION_TOO_LONG");
  }
  return {
    format: STUDY_SESSION_FORMAT,
    version: STUDY_SESSION_VERSION,
    subjectId: input.subjectId.toLowerCase(),
    title,
    notes,
    startsAt,
    tasks,
  };
}

export function emptyStudySession(subjectId) {
  return normalizeStudySession({
    format: STUDY_SESSION_FORMAT,
    version: STUDY_SESSION_VERSION,
    subjectId,
    title: "Mi sesión de estudio",
    notes: "",
    startsAt: null,
    tasks: [],
  });
}

export function readStudySession(text) {
  if (typeof text !== "string" || text.length > 64000) {
    fail("STUDY_SESSION_FILE_TOO_LARGE");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("STUDY_SESSION_JSON_INVALID");
  }
  return normalizeStudySession(parsed);
}

export function serializeStudySession(value) {
  return JSON.stringify(normalizeStudySession(value), null, 2) + "\n";
}

export function studySessionStats(value) {
  const plan = normalizeStudySession(value);
  const totalMinutes = plan.tasks.reduce((sum, task) => sum + task.minutes, 0);
  const doneMinutes = plan.tasks.reduce(
    (sum, task) => sum + (task.done ? task.minutes : 0),
    0,
  );
  return {
    totalTasks: plan.tasks.length,
    doneTasks: plan.tasks.filter((task) => task.done).length,
    totalMinutes,
    doneMinutes,
    remainingMinutes: totalMinutes - doneMinutes,
  };
}

function verifiedLabels(plan, labels) {
  if (
    !Array.isArray(labels) || labels.length !== plan.tasks.length ||
    labels.some(
      (name) =>
        typeof name !== "string" ||
        name.trim().length === 0 ||
        name.length > 180,
    )
  ) {
    fail("STUDY_SESSION_AUTHORITY_REQUIRED");
  }
  return labels.map((label) => cleanText(label, 180, "STUDY_SESSION_AUTHORITY_REQUIRED"));
}

function icsEscape(value) {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/\r\n|\r|\n/gu, "\\n")
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,");
}

function icsUtc(date) {
  return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function foldIcsLine(line) {
  // RFC 5545: fold before 75 octets; continuation begins with one SPACE.
  const encoder = new TextEncoder();
  const segments = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const weight = encoder.encode(character).length;
    if (bytes + weight > (segments.length === 0 ? 75 : 74)) {
      segments.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += weight;
  }
  segments.push(current);
  return segments.join("\r\n ");
}

export function buildStudySessionCalendar(value, labels, uid, generatedAt) {
  const plan = normalizeStudySession(value);
  const titles = verifiedLabels(plan, labels);
  if (!plan.startsAt || plan.tasks.length === 0) {
    fail("STUDY_SESSION_CALENDAR_NEEDS_TIME_AND_TASKS");
  }
  if (typeof uid !== "string" || !UUID_V4.test(uid)) {
    fail("STUDY_SESSION_UID_INVALID");
  }
  if (!(generatedAt instanceof Date) || !Number.isFinite(generatedAt.getTime())) {
    fail("STUDY_SESSION_DATE_INVALID");
  }
  const start = new Date(plan.startsAt);
  const end = new Date(
    start.getTime() +
    plan.tasks.reduce((sum, task) => sum + task.minutes, 0) * 60000,
  );
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Los Apuntes//Study Sessions//ES",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${uid.toLowerCase()}@losapuntes.app`,
    `DTSTAMP:${icsUtc(generatedAt)}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(plan.title)}`,
    `DESCRIPTION:${icsEscape([
      "Sesión de estudio organizada por el estudiante.",
      ...plan.tasks.map(
        (task, index) =>
          `${index + 1}. ${titles[index]} (${task.minutes} min, ${task.done ? "revisado" : "pendiente"})`,
      ),
      ...(plan.notes ? ["Notas: " + plan.notes] : []),
    ].join("\n"))}`,
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function buildStudySessionMarkdown(value, labels) {
  const plan = normalizeStudySession(value);
  const titles = verifiedLabels(plan, labels);
  const safeLine = (s) => s.replace(/[\r\n]/gu, " ").replace(/[\\*\[\]_#`]/gu, "\\$&");
  return [
    `# ${safeLine(plan.title)}`,
    "",
    `Materia (ID): ${plan.subjectId}`,
    `Inicio previsto: ${plan.startsAt ?? "sin definir"} (hora local)`,
    "",
    "## Actividades",
    ...plan.tasks.map(
      (task, index) =>
        `- [${task.done ? "x" : " "}] ${index + 1}. ${safeLine(titles[index])} — ${task.minutes} min`,
    ),
    "",
    "## Notas",
    safeLine(plan.notes || "Sin notas."),
    "",
    "Los recursos y preguntas requieren permisos vigentes en Los Apuntes.",
    "",
  ].join("\n");
}
