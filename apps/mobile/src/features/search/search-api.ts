import type {
  ContextualDiscoveryResponse,
  PublicProfileResponse,
  ResourceView,
  SearchResponse,
  SearchScope,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

import type { SessionController } from "../session/session-controller";

export type MobileSearchInput = {
  q: string;
  scope: SearchScope;
  subjectId?: string;
};

export interface MobileSearchTransport {
  search(
    credential: string,
    input: MobileSearchInput & { limit: number },
    signal?: AbortSignal,
  ): Promise<SearchResponse>;
  contextualDiscovery(
    credential: string,
    input: { subjectLimit: number; resourcesPerSubject: number },
    signal?: AbortSignal,
  ): Promise<ContextualDiscoveryResponse>;
  resource(
    credential: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<{ resource: ResourceView }>;
  publicProfile(
    credential: string,
    profileId: string,
    signal?: AbortSignal,
  ): Promise<PublicProfileResponse>;
}

export class MobileSearchApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: MobileSearchTransport,
  ) {}

  search(input: MobileSearchInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.search(credential, { ...input, limit: 8 }, signal),
    );
  }

  contextualDiscovery(signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.contextualDiscovery(
        credential,
        { subjectLimit: 6, resourcesPerSubject: 4 },
        signal,
      ),
    );
  }

  resource(resourceId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.resource(credential, resourceId, signal),
    );
  }

  publicProfile(profileId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.publicProfile(credential, profileId, signal),
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
      const value = await operation(snapshot.credential);

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

      return value;
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
