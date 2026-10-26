const escapeCalendarText = (value) =>
  String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .replace(/\\/gu, "\\\\")
    .replace(/\r\n|\r|\n/gu, "\\n")
    .replace(/,/gu, "\\,")
    .replace(/;/gu, "\\;");

const toCalendarDate = (value, roundUp = false) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (roundUp) date.setTime(Math.ceil(date.getTime() / 1000) * 1000);
  return date
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
};

const utf8Length = (character) => {
  const codePoint = character.codePointAt(0);
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
};

const foldCalendarLine = (line) => {
  const folded = [];
  let current = "";
  let currentBytes = 0;

  for (const character of line) {
    const characterBytes = utf8Length(character);
    if (currentBytes + characterBytes > 75) {
      folded.push(current);
      current = ` ${character}`;
      currentBytes = 1 + characterBytes;
    } else {
      current += character;
      currentBytes += characterBytes;
    }
  }

  folded.push(current);
  return folded;
};

const isUsableEvent = (event) =>
  event &&
  typeof event.id === "string" &&
  event.id.length > 0 &&
  event.id.length <= 256 &&
  typeof event.title === "string" &&
  event.title.trim().length > 0 &&
  event.state === "scheduled";

export const serializeOrganizationEventCalendar = (
  event,
  generatedAt = new Date(),
) => {
  if (!isUsableEvent(event)) return null;

  const startsAt = toCalendarDate(event.startsAt);
  const endsAt = event.endsAt ? toCalendarDate(event.endsAt, true) : null;
  const timestamp = toCalendarDate(generatedAt);
  const startTime = new Date(event.startsAt).getTime();
  const endTime = event.endsAt ? new Date(event.endsAt).getTime() : null;
  if (
    !startsAt ||
    (event.endsAt && !endsAt) ||
    !timestamp ||
    (endTime !== null && endTime <= startTime)
  ) {
    return null;
  }

  const details = [event.description?.trim(), event.externalUrl?.trim()]
    .filter(Boolean)
    .join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Los Apuntes//Organization Events//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${encodeURIComponent(event.id)}@events.losapuntes.app`,
    `DTSTAMP:${timestamp}`,
    `DTSTART:${startsAt}`,
    ...(endsAt ? [`DTEND:${endsAt}`] : []),
    `SUMMARY:${escapeCalendarText(event.title.trim())}`,
    ...(details ? [`DESCRIPTION:${escapeCalendarText(details)}`] : []),
    ...(event.locationLabel?.trim()
      ? [`LOCATION:${escapeCalendarText(event.locationLabel.trim())}`]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.flatMap(foldCalendarLine).join("\r\n")}\r\n`;
};
