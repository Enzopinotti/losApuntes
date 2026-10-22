import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "@/features/session/session-controller";

export type HomeHelpOpportunity = {
  subjectId: string;
  subjectName: string;
  unansweredPeerQuestions: number;
};

export type HomeHelpOpportunities = {
  items: HomeHelpOpportunity[];
  hasMoreSubjects: boolean;
};

export interface HomeHelpOpportunitiesTransport {
  opportunities(credential: string, signal?: AbortSignal): Promise<unknown>;
  subjectParticipations(
    credential: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
}

export class HomeHelpOpportunitiesHttpTransport implements HomeHelpOpportunitiesTransport {
  constructor(private readonly client: MobileApiClient) {}

  opportunities(credential: string, signal?: AbortSignal) {
    return this.client.request<unknown>("/qa/me/help-opportunities", {
      credential,
      ...(signal ? { signal } : {}),
    });
  }

  subjectParticipations(credential: string, signal?: AbortSignal) {
    return this.client.academicSubjects(credential, undefined, signal);
  }
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MAX_OPPORTUNITIES = 12;
const MAX_SUBJECT_PARTICIPATIONS = 100;

function unavailable(): never {
  throw new ApiRequestError(
    "server_unavailable",
    503,
    "QA_HELP_OPPORTUNITIES_UNAVAILABLE",
    "Q&A help opportunities are unavailable",
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function canonicalId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

export function parseHomeHelpOpportunities(
  opportunitiesValue: unknown,
  participationsValue: unknown,
): HomeHelpOpportunities {
  const opportunities = record(opportunitiesValue);
  const participations = record(participationsValue);
  if (
    !opportunities ||
    !participations ||
    !Array.isArray(opportunities.items) ||
    opportunities.items.length > MAX_OPPORTUNITIES ||
    typeof opportunities.hasMoreSubjects !== "boolean" ||
    !Array.isArray(participations.participations) ||
    participations.participations.length > MAX_SUBJECT_PARTICIPATIONS ||
    !Number.isSafeInteger(participations.limit) ||
    (participations.limit as number) < 1 ||
    (participations.limit as number) > MAX_SUBJECT_PARTICIPATIONS ||
    participations.participations.length > (participations.limit as number) ||
    typeof participations.truncated !== "boolean"
  ) {
    return unavailable();
  }

  const currentSubjects = new Map<string, string>();
  const participationStates = new Set([
    "planned",
    "current",
    "completed",
    "dropped",
  ]);
  for (const value of participations.participations) {
    const row = record(value);
    if (
      !row ||
      !canonicalId(row.subjectId) ||
      typeof row.subjectName !== "string" ||
      row.subjectName.trim() !== row.subjectName ||
      row.subjectName.length === 0 ||
      row.subjectName.length > 160 ||
      typeof row.state !== "string" ||
      !participationStates.has(row.state)
    ) {
      return unavailable();
    }
    if (row.state !== "current") continue;
    const previousName = currentSubjects.get(row.subjectId);
    if (previousName && previousName !== row.subjectName) return unavailable();
    currentSubjects.set(row.subjectId, row.subjectName);
  }

  const seen = new Set<string>();
  const items: HomeHelpOpportunity[] = [];
  for (const value of opportunities.items) {
    const row = record(value);
    if (
      !row ||
      !canonicalId(row.subjectId) ||
      seen.has(row.subjectId) ||
      !Number.isSafeInteger(row.unansweredPeerQuestions) ||
      (row.unansweredPeerQuestions as number) < 0
    ) {
      return unavailable();
    }
    const subjectName = currentSubjects.get(row.subjectId);
    if (!subjectName) return unavailable();
    seen.add(row.subjectId);
    items.push({
      subjectId: row.subjectId,
      subjectName,
      unansweredPeerQuestions: row.unansweredPeerQuestions as number,
    });
  }

  items.sort(
    (left, right) =>
      right.unansweredPeerQuestions - left.unansweredPeerQuestions ||
      (left.subjectId < right.subjectId
        ? -1
        : left.subjectId > right.subjectId
          ? 1
          : 0),
  );

  return {
    items,
    hasMoreSubjects: opportunities.hasMoreSubjects,
  };
}

export class MobileHomeHelpOpportunitiesApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: HomeHelpOpportunitiesTransport,
  ) {}

  async list(signal?: AbortSignal): Promise<HomeHelpOpportunities> {
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
      const [opportunities, participations] = await Promise.all([
        this.transport.opportunities(snapshot.credential, signal),
        this.transport.subjectParticipations(snapshot.credential, signal),
      ]);
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
      return parseHomeHelpOpportunities(opportunities, participations);
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
