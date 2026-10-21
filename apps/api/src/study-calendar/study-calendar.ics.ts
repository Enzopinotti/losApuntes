import { createHash } from 'node:crypto';

export interface StudyCalendarEvent {
  subjectId: string;
  revision: number;
  updatedAt: Date;
  startsAtLocal: string;
  minutes: number;
  title: string;
}

// RFC 5545 TEXT: escape control delimiters before folding physical lines.
// The persisted plan parser already rejects ASCII control characters.
function escapeText(value: string): string {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/;/gu, '\\;')
    .replace(/,/gu, '\\,')
    .replace(/\r\n|\n|\r/gu, '\\n');
}

// 75 OCTETS per physical line, counting the continuation space.
// Iterating code points prevents slicing UTF-8 multibyte sequences.
export function foldIcsLine(logical: string): string {
  const lines: string[] = [];
  let segment = '';
  let length = 0;
  for (const char of logical) {
    const size = Buffer.byteLength(char, 'utf8');
    if (length + size > 75) {
      lines.push(segment);
      segment = ' ';
      length = 1;
    }
    segment += char;
    length += size;
  }
  lines.push(segment);
  return lines.join('\r\n');
}

function utcBasic(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
}

function localBasic(date: string): string {
  // The stored datetime has no offset. Floating DTSTART is intentional:
  // attaching Z or a server timezone would shift the student's wall time.
  return date.replace(/[-:]/gu, '') + '00';
}

function stableUid(ownerUserId: string, subjectId: string): string {
  const digest = createHash('sha256')
    .update(ownerUserId, 'utf8')
    .update('\0', 'utf8')
    .update(subjectId, 'utf8')
    .digest('hex');
  return digest + '@calendar.losapuntes.invalid';
}

export function renderStudyCalendar(
  ownerUserId: string,
  events: readonly StudyCalendarEvent[],
  generatedAt: Date,
): string {
  const stamp = utcBasic(generatedAt);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Los Apuntes//Study Session Calendar v1//ES',
    'CALSCALE:GREGORIAN',
  ];

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + stableUid(ownerUserId, event.subjectId),
      'DTSTAMP:' + stamp,
      'LAST-MODIFIED:' + utcBasic(event.updatedAt),
      'SEQUENCE:' + event.revision,
      'DTSTART:' + localBasic(event.startsAtLocal),
      'DURATION:PT' + event.minutes + 'M',
      'SUMMARY:' + escapeText(event.title),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
