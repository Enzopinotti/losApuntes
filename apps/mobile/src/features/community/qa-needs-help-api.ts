import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "@/features/session/session-controller";

export type QaNeedsHelpQuestion = {
  questionId: string;
  subjectId: string;
  title: string;
  createdAt: string;
};

export type QaNeedsHelpPage = {
  items: QaNeedsHelpQuestion[];
  nextCursor: string | null;
};

export interface QaNeedsHelpTransport {
  get(
    credential: string,
    subjectId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

export class QaNeedsHelpHttpTransport implements QaNeedsHelpTransport {
  constructor(private readonly client: MobileApiClient) {}

  get(
    credential: string,
    subjectId: string,
    cursor?: string,
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({ subjectId });
    if (cursor) query.set("cursor", cursor);
    return this.client.request<unknown>(
      `/qa/discovery/needs-help?${query.toString()}`,
      {
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }
}

export const QA_NEEDS_HELP_PAGE_SIZE = 15;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OPAQUE_CURSOR = /^[A-Za-z0-9_-]{1,512}$/u;

function unavailable(): never {
  throw new ApiRequestError(
    "server_unavailable",
    503,
    "QA_NEEDS_HELP_UNAVAILABLE",
    "Q&A needs-help response is unavailable",
  );
}

function invalidSubject(): never {
  throw new ApiRequestError(
    "validation",
    400,
    "QA_NEEDS_HELP_SUBJECT_INVALID",
    "A canonical subject is required",
  );
}

function canonicalSubjectId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function parseQuestion(
  value: unknown,
  requestedSubjectId: string,
): QaNeedsHelpQuestion {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return unavailable();
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.questionId !== "string" ||
    !UUID_V4.test(row.questionId) ||
    typeof row.subjectId !== "string" ||
    !UUID_V4.test(row.subjectId) ||
    row.subjectId !== requestedSubjectId ||
    typeof row.title !== "string" ||
    row.title.trim().length === 0 ||
    row.title.length > 180 ||
    !canonicalTimestamp(row.createdAt)
  ) {
    return unavailable();
  }
  return {
    questionId: row.questionId,
    subjectId: row.subjectId,
    title: row.title,
    createdAt: row.createdAt,
  };
}

export function parseQaNeedsHelpPage(
  value: unknown,
  requestedSubjectId: string,
): QaNeedsHelpPage {
  if (!canonicalSubjectId(requestedSubjectId)) invalidSubject();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return unavailable();
  }
  const raw = value as Record<string, unknown>;
  if (
    !Array.isArray(raw.items) ||
    raw.items.length > QA_NEEDS_HELP_PAGE_SIZE ||
    (raw.items.length === 0 && raw.nextCursor !== null) ||
    !(
      raw.nextCursor === null ||
      (typeof raw.nextCursor === "string" && OPAQUE_CURSOR.test(raw.nextCursor))
    )
  ) {
    return unavailable();
  }

  const items = raw.items.map((item) =>
    parseQuestion(item, requestedSubjectId),
  );
  const seen = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || seen.has(item.questionId)) return unavailable();
    seen.add(item.questionId);
    const previous = items[index - 1];
    if (
      previous &&
      (item.createdAt < previous.createdAt ||
        (item.createdAt === previous.createdAt &&
          item.questionId <= previous.questionId))
    ) {
      return unavailable();
    }
  }

  return { items, nextCursor: raw.nextCursor };
}

export class MobileQaNeedsHelpApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: QaNeedsHelpTransport,
  ) {}

  async list(subjectId: string, cursor?: string, signal?: AbortSignal) {
    if (!canonicalSubjectId(subjectId)) invalidSubject();
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
      const response = await this.transport.get(
        snapshot.credential,
        subjectId,
        cursor,
        signal,
      );
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
      return parseQaNeedsHelpPage(response, subjectId);
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
