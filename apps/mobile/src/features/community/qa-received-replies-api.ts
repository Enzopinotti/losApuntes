import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "@/features/session/session-controller";

export type QaReceivedReply = {
  answerId: string;
  questionId: string;
  subjectId: string;
  questionTitle: string;
  answeredAt: string;
  isAccepted: boolean;
};

export type QaReceivedRepliesPage = {
  items: QaReceivedReply[];
  nextCursor: string | null;
};

export interface QaReceivedRepliesTransport {
  get(
    credential: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

export class QaReceivedRepliesHttpTransport implements QaReceivedRepliesTransport {
  constructor(private readonly client: MobileApiClient) {}

  get(credential: string, cursor?: string, signal?: AbortSignal) {
    const query = new URLSearchParams();
    if (cursor) query.set("cursor", cursor);
    const encodedQuery = query.toString();
    const suffix = encodedQuery ? `?${encodedQuery}` : "";
    return this.client.request<unknown>(`/qa/me/received-replies${suffix}`, {
      credential,
      ...(signal ? { signal } : {}),
    });
  }
}

export const QA_RECEIVED_REPLIES_PAGE_SIZE = 10;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OPAQUE_CURSOR = /^[A-Za-z0-9_-]{1,512}$/u;

function unavailable(): never {
  throw new ApiRequestError(
    "server_unavailable",
    503,
    "QA_RECEIVED_REPLIES_UNAVAILABLE",
    "Q&A received replies response is unavailable",
  );
}

function nonblankId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value
  );
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function parseReply(value: unknown): QaReceivedReply {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return unavailable();
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.answerId !== "string" ||
    !UUID_V4.test(row.answerId) ||
    !nonblankId(row.questionId) ||
    !nonblankId(row.subjectId) ||
    typeof row.questionTitle !== "string" ||
    row.questionTitle.trim().length === 0 ||
    row.questionTitle.length > 2048 ||
    !canonicalTimestamp(row.answeredAt) ||
    typeof row.isAccepted !== "boolean"
  ) {
    return unavailable();
  }

  // Explicit projection keeps author and answer content out of the Mobile model.
  return {
    answerId: row.answerId,
    questionId: row.questionId,
    subjectId: row.subjectId,
    questionTitle: row.questionTitle,
    answeredAt: row.answeredAt,
    isAccepted: row.isAccepted,
  };
}

export function parseQaReceivedRepliesPage(
  value: unknown,
): QaReceivedRepliesPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return unavailable();
  }
  const raw = value as Record<string, unknown>;
  if (
    !Array.isArray(raw.items) ||
    raw.items.length > QA_RECEIVED_REPLIES_PAGE_SIZE ||
    (raw.items.length === 0 && raw.nextCursor !== null) ||
    !(
      raw.nextCursor === null ||
      (typeof raw.nextCursor === "string" && OPAQUE_CURSOR.test(raw.nextCursor))
    )
  ) {
    return unavailable();
  }

  const items = raw.items.map(parseReply);
  const seen = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || seen.has(item.answerId)) return unavailable();
    seen.add(item.answerId);
    const previous = items[index - 1];
    if (
      previous &&
      (previous.answeredAt < item.answeredAt ||
        (previous.answeredAt === item.answeredAt &&
          previous.answerId.localeCompare(item.answerId) > 0))
    ) {
      return unavailable();
    }
  }

  return { items, nextCursor: raw.nextCursor };
}

export class MobileQaReceivedRepliesApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: QaReceivedRepliesTransport,
  ) {}

  async list(cursor?: string, signal?: AbortSignal) {
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
      return parseQaReceivedRepliesPage(response);
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
