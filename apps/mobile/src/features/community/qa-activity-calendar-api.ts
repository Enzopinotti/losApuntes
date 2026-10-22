import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "@/features/session/session-controller";

export type QaActivityCalendarDay = {
  dateUtc: string;
  questions: number;
  answers: number;
  total: number;
};

export type QaActivityCalendar = {
  asOfUtc: string;
  windowStartUtc: string;
  windowEndUtcExclusive: string;
  days: QaActivityCalendarDay[];
};

export interface QaActivityCalendarTransport {
  get(credential: string, signal?: AbortSignal): Promise<unknown>;
}

export class QaActivityCalendarHttpTransport implements QaActivityCalendarTransport {
  constructor(private readonly client: MobileApiClient) {}

  get(credential: string, signal?: AbortSignal) {
    return this.client.request<unknown>("/qa/me/activity-calendar", {
      credential,
      ...(signal ? { signal } : {}),
    });
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 28;

function unavailable(): never {
  throw new ApiRequestError(
    "server_unavailable",
    503,
    "QA_ACTIVITY_CALENDAR_UNAVAILABLE",
    "Q&A activity calendar response is unavailable",
  );
}

function canonicalTimestamp(value: unknown): number {
  if (typeof value !== "string") return unavailable();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    return unavailable();
  }
  return time;
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function nonnegativeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return unavailable();
  }
  return value;
}

export function parseQaActivityCalendar(value: unknown): QaActivityCalendar {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return unavailable();
  }
  const raw = value as Record<string, unknown>;
  const asOf = canonicalTimestamp(raw.asOfUtc);
  const start = canonicalTimestamp(raw.windowStartUtc);
  const end = canonicalTimestamp(raw.windowEndUtcExclusive);
  if (
    start % DAY_MS !== 0 ||
    end - start !== WINDOW_DAYS * DAY_MS ||
    asOf < end - DAY_MS ||
    asOf >= end ||
    !Array.isArray(raw.days) ||
    raw.days.length !== WINDOW_DAYS
  ) {
    return unavailable();
  }

  const days: QaActivityCalendarDay[] = raw.days.map((candidate, index) => {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return unavailable();
    }
    const day = candidate as Record<string, unknown>;
    const expectedDate = new Date(start + index * DAY_MS)
      .toISOString()
      .slice(0, 10);
    if (!isDate(day.dateUtc) || day.dateUtc !== expectedDate) {
      return unavailable();
    }
    const questions = nonnegativeCount(day.questions);
    const answers = nonnegativeCount(day.answers);
    const total = nonnegativeCount(day.total);
    if (
      !Number.isSafeInteger(questions + answers) ||
      total !== questions + answers
    ) {
      return unavailable();
    }
    return { dateUtc: day.dateUtc, questions, answers, total };
  });

  return {
    asOfUtc: raw.asOfUtc as string,
    windowStartUtc: raw.windowStartUtc as string,
    windowEndUtcExclusive: raw.windowEndUtcExclusive as string,
    days,
  };
}

export class MobileQaActivityCalendarApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: QaActivityCalendarTransport,
  ) {}

  async get(signal?: AbortSignal): Promise<QaActivityCalendar> {
    const snapshot = this.session.getCredentialSnapshot();
    if (!snapshot) {
      throw new ApiRequestError(
        "unauthorized",
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication required",
      );
    }

    try {
      const response = await this.transport.get(snapshot.credential, signal);
      if (
        !this.session.isCredentialAuthoritative(
          snapshot.credential,
          snapshot.generation,
        )
      ) {
        throw new ApiRequestError(
          "unauthorized",
          null,
          "STALE_SESSION_AUTHORITY",
          "Session authority changed while the request was in flight",
        );
      }
      return parseQaActivityCalendar(response);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.kind === "unauthorized") {
          await this.session.invalidateIfAuthoritative(
            snapshot.credential,
            snapshot.generation,
          );
        } else if (error.code === "ACCOUNT_RESTRICTED") {
          await this.session.restrictIfAuthoritative(
            snapshot.credential,
            snapshot.generation,
          );
        }
      }
      throw error;
    }
  }
}
