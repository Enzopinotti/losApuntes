import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "@/features/session/session-controller";

export type StudyAgendaEntry = {
  subjectId: string;
  revision: number;
  updatedAt: string;
  title: string;
  startsAt: string | null;
  tasks: {
    total: number;
    completed: number;
    pending: number;
  };
  minutes: {
    planned: number;
    completed: number;
    remaining: number;
  };
};

export type StudyAgenda = {
  scheduled: StudyAgendaEntry[];
  unscheduled: StudyAgendaEntry[];
};

export interface StudyAgendaTransport {
  get(credential: string, signal?: AbortSignal): Promise<StudyAgenda>;
}

export class StudyAgendaHttpTransport implements StudyAgendaTransport {
  constructor(private readonly client: MobileApiClient) {}

  get(credential: string, signal?: AbortSignal) {
    return this.client.request<StudyAgenda>("/study-progress/me/agenda", {
      credential,
      ...(signal ? { signal } : {}),
    });
  }
}

export class MobileStudyAgendaApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: StudyAgendaTransport,
  ) {}

  async get(signal?: AbortSignal): Promise<StudyAgenda> {
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
      const agenda = await this.transport.get(snapshot.credential, signal);
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
      return agenda;
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
