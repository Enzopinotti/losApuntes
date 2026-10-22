import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "@/features/session/session-controller";

export type StudyNextActionTask = {
  kind: "resource" | "question";
  id: string;
  minutes: number;
};

export type StudyNextAction = {
  subjectId: string;
  revision: number;
  title: string;
  startsAtLocal: string | null;
  updatedAt: string;
  pendingTasks: number;
  remainingMinutes: number;
  nextTask: StudyNextActionTask;
};

export type StudyNextActions = {
  items: StudyNextAction[];
  summary: {
    totalPlans: number;
    actionablePlans: number;
    completedPlans: number;
    emptyPlans: number;
  };
};

export interface StudyNextActionsTransport {
  get(credential: string, signal?: AbortSignal): Promise<StudyNextActions>;
}

export class StudyNextActionsHttpTransport implements StudyNextActionsTransport {
  constructor(private readonly client: MobileApiClient) {}

  get(credential: string, signal?: AbortSignal) {
    return this.client.request<StudyNextActions>(
      "/study-progress/me/next-actions",
      {
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }
}

export class MobileStudyNextActionsApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: StudyNextActionsTransport,
  ) {}

  async get(signal?: AbortSignal): Promise<StudyNextActions> {
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
      const actions = await this.transport.get(snapshot.credential, signal);
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
      return actions;
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
