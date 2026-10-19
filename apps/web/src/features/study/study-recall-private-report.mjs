import {
  RECALL_ATTEMPT_HISTORY_LIMIT,
  RECALL_REVIEW_DURATIONS,
} from "./study-recall-planning.mjs";
import { ACTIVE_RECALL_MAX_QUESTIONS } from "./study-active-recall.mjs";

export const RECALL_REPORT_FORMAT = "losapuntes.private-recall-report";
export const RECALL_REPORT_VERSION = 1;

function fail() {
  const error = new Error("RECALL_PRIVATE_REPORT_INVALID");
  error.code = "RECALL_PRIVATE_REPORT_INVALID";
  throw error;
}

function plain(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

function exact(value, fields) {
  return plain(value) &&
    Object.keys(value).sort().join(",") === [...fields].sort().join(",");
}

function validatedAttempt(value) {
  if (!exact(value, ["pass", "total", "understood", "review", "pending"])) {
    fail();
  }
  const { pass, total, understood, review, pending } = value;
  if (![pass, total, understood, review, pending].every(
    (v) => Number.isSafeInteger(v) && v >= 0,
  ) ||
    pass < 1 || pass > 10000 ||
    total < 1 || total > ACTIVE_RECALL_MAX_QUESTIONS ||
    understood + review + pending !== total) {
    fail();
  }
  return { pass, total, understood, review, pending };
}

function attemptLine(snapshot) {
  return `- Intento ${snapshot.pass}: ${snapshot.total} preguntas · ${snapshot.understood} explicadas · ${snapshot.review} para repasar · ${snapshot.pending} sin clasificar`;
}

/**
 * User-initiated plain text export only; omit subject, question IDs, content,
 * reflections, author identities, dates, tokens, and authorization metadata.
 * This is a personal recap, NOT an academic grade or certified progress.
 */
export function buildPrivateRecallReport(input) {
  if (!exact(input, ["history", "current", "minutes"]) ||
    !Array.isArray(input.history) ||
    input.history.length > RECALL_ATTEMPT_HISTORY_LIMIT ||
    !RECALL_REVIEW_DURATIONS.includes(input.minutes)) {
    fail();
  }
  const history = input.history.map(validatedAttempt);
  const current = validatedAttempt(input.current);
  for (let i = 1; i < history.length; i++) {
    if (history[i].pass <= history[i - 1].pass) fail();
  }
  const last = history.at(-1);
  if (
    last
      ? last.pass + 1 !== current.pass || last.review !== current.total
      : current.pass !== 1
  ) {
    fail();
  }
  const estimatedMinutes = current.review * input.minutes;
  const lines = [
    "# Resumen privado de práctica — Los Apuntes",
    "",
    "Esta ficha contiene exclusivamente recuentos de marcas elegidas por vos.",
    "No es una calificación ni acredita aprendizaje.",
    "",
    "## Intentos de esta ronda",
    ...history.map(attemptLine),
    attemptLine(current),
    "",
    "## Próximo repaso sugerido",
    `- Preguntas marcadas para repasar: ${current.review}`,
    `- Minutos elegidos por pregunta: ${input.minutes}`,
    `- Tiempo estimado total: ${estimatedMinutes} minutos`,
    "",
    "Tus preguntas, respuestas escritas, aportes de terceros y datos de cuenta no se incluyen.",
    "Para estudiar ese contenido, volvé a la aplicación y verificá el acceso vigente.",
    "",
  ];
  return lines.join("\n");
}
