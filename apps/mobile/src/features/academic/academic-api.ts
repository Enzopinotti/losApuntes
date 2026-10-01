import type {
  AcademicAffiliationListResponse,
  AcademicCurrentContextResponse,
  AcademicSubjectParticipationListResponse,
  SetAcademicContextInput,
} from "@losapuntes/contracts";

import type { SessionController } from "@/features/session/session-controller";
import { ApiRequestError, type MobileApiClient } from "@/services/api/client";

export interface AcademicContextApi {
  affiliations(signal?: AbortSignal): Promise<AcademicAffiliationListResponse>;
  subjects(
    signal?: AbortSignal,
  ): Promise<AcademicSubjectParticipationListResponse>;
  context(signal?: AbortSignal): Promise<AcademicCurrentContextResponse>;
  setContext(
    input: SetAcademicContextInput,
    signal?: AbortSignal,
  ): Promise<AcademicCurrentContextResponse>;
}

export class AcademicMobileApi implements AcademicContextApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: MobileApiClient,
  ) {}

  affiliations(signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.academicAffiliations(credential, signal),
    );
  }

  subjects(signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.academicSubjects(credential, signal),
    );
  }

  context(signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.academicContext(credential, signal),
    );
  }

  setContext(input: SetAcademicContextInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.setAcademicContext(credential, input, signal),
    );
  }

  private async authorized<T>(
    operation: (credential: string) => Promise<T>,
  ): Promise<T> {
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
      return await operation(snapshot.credential);
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
