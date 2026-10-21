import {
  foldIcsLine,
  renderStudyCalendar,
  type StudyCalendarEvent,
} from './study-calendar.ics';

const SUBJECT = 'b14211d1-6f33-4e14-a946-000000000001';
const UPDATED = new Date('2026-10-20T16:30:00.000Z');
const GENERATED = new Date('2026-10-21T11:45:09.000Z');

function event(title: string): StudyCalendarEvent {
  return {
    subjectId: SUBJECT,
    revision: 4,
    updatedAt: UPDATED,
    startsAtLocal: '2026-11-03T09:30',
    minutes: 95,
    title,
  };
}

describe('B173 safe RFC5545 calendar renderer', () => {
  it('preserves floating wall time without Z or server timezone', () => {
    const output = renderStudyCalendar('owner-one', [event('Repasar')], GENERATED);
    expect(output).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n');
    expect(output).toContain('BEGIN:VEVENT\r\n');
    expect(output).toContain('DTSTAMP:20261021T114509Z\r\n');
    expect(output).toContain('LAST-MODIFIED:20261020T163000Z\r\n');
    expect(output).toContain('DTSTART:20261103T093000\r\n');
    expect(output).not.toContain('DTSTART;TZID=');
    expect(output).not.toContain('DTSTART:20261103T093000Z');
    expect(output).toContain('DURATION:PT95M\r\n');
    expect(output).toContain('SEQUENCE:4\r\n');
    expect(output).toContain('SUMMARY:Repasar\r\n');
    expect(output.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(output).not.toMatch(/(?<!\r)\n/u);
  });

  it('escapes potentially structural text and cannot inject a new VEVENT', () => {
    const title = 'Trabajo, entrega; final\\bibliografía\r\nBEGIN:VEVENT';
    const output = renderStudyCalendar('owner', [event(title)], GENERATED);
    expect(output.split('\r\n').filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(output.split('\r\n').filter((line) => line === 'END:VEVENT')).toHaveLength(1);
    expect(output.replace(/\r\n /gu, '')).toContain(
      'SUMMARY:Trabajo\\, entrega\\; final\\\\bibliografía\\nBEGIN:VEVENT',
    );
    expect(output).not.toContain('\r\nBEGIN:VEVENT\r\nBEGIN:VEVENT');
  });

  it('folds long Unicode titles into <=75 UTF-8 octet physical lines', () => {
    const title = '🧠Árboles y grafos; '.repeat(24);
    const output = renderStudyCalendar('owner', [event(title)], GENERATED);
    const lines = output.split('\r\n').filter((line) => line.length > 0);
    for (const line of lines) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    const unfolded = output.replace(/\r\n /gu, '');
    expect(unfolded).toContain('SUMMARY:' + title.replace(/;/gu, '\\;'));
    expect(unfolded).toContain('END:VEVENT\r\nEND:VCALENDAR\r\n');
    expect(foldIcsLine('x'.repeat(170)).split('\r\n').length).toBe(3);
  });

  it('creates stable opaque per-owner per-subject UIDs', () => {
    const first = renderStudyCalendar('owner-one', [event('A')], GENERATED);
    const second = renderStudyCalendar('owner-one', [event('B')], GENERATED);
    const other = renderStudyCalendar('owner-two', [event('A')], GENERATED);
    const uid = (data: string) => data.match(/UID:([^\r\n]+)/u)?.[1];
    expect(uid(first)).toBe(uid(second));
    expect(uid(first)).not.toBe(uid(other));
    expect(uid(first)).toMatch(/^[a-f0-9]{64}@calendar\.losapuntes\.invalid$/u);
    expect(first).not.toContain('owner-one');
    expect(first).not.toContain(SUBJECT);
  });

  it('returns an importable empty calendar with no fake events', () => {
    expect(renderStudyCalendar('owner', [], GENERATED)).toBe(
      'BEGIN:VCALENDAR\r\n' +
        'VERSION:2.0\r\n' +
        'PRODID:-//Los Apuntes//Study Session Calendar v1//ES\r\n' +
        'CALSCALE:GREGORIAN\r\n' +
        'END:VCALENDAR\r\n',
    );
  });
});
