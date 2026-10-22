import type { QaActivityCalendar } from "./qa-activity-calendar-api";

export type QaActivityCalendarCell =
  | { kind: "spacer"; key: string }
  | {
      kind: "day";
      key: string;
      day: QaActivityCalendar["days"][number];
      dayNumber: string;
    };

export function qaActivityCalendarCells(
  calendar: QaActivityCalendar,
): QaActivityCalendarCell[] {
  const firstDate = calendar.days[0]?.dateUtc;
  if (!firstDate) return [];
  const weekday = new Date(`${firstDate}T00:00:00.000Z`).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const spacers = Array.from({ length: mondayOffset }, (_, index) => ({
    kind: "spacer" as const,
    key: `spacer-${index}`,
  }));
  const days = calendar.days.map((day) => ({
    kind: "day" as const,
    key: day.dateUtc,
    day,
    dayNumber: day.dateUtc.slice(-2),
  }));
  return [...spacers, ...days];
}

export function qaActivityCalendarSummary(calendar: QaActivityCalendar) {
  return calendar.days.reduce(
    (sum, day) => ({
      questions: sum.questions + day.questions,
      answers: sum.answers + day.answers,
      activeDays: sum.activeDays + (day.total > 0 ? 1 : 0),
    }),
    { questions: 0, answers: 0, activeDays: 0 },
  );
}

export function qaActivityIntensity(total: number): 0 | 1 | 2 | 3 {
  if (!Number.isSafeInteger(total) || total <= 0) return 0;
  if (total === 1) return 1;
  if (total <= 3) return 2;
  return 3;
}
