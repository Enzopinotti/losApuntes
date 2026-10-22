const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u;

/** Preserve the stored wall-clock value; never reinterpret it as a UTC instant. */
export function formatStudyAgendaLocalTime(value: string): string {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match;
  return `${day}/${month}/${year} · ${hour}:${minute}`;
}
