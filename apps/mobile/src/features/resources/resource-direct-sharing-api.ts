import type {
  ResourceShareGrantsPage,
  ResourceView,
  SearchPersonResult,
} from "@losapuntes/contracts";

import type { MobileSearchApi } from "@/features/search/search-api";
import type { SessionController } from "@/features/session/session-controller";
import { ApiRequestError, type MobileApiClient } from "@/services/api/client";

import type { ResourceConsumptionApi } from "./resource-consumption-api";

export interface ResourceDirectSharingApi {
  searchPeople(
    query: string,
    signal?: AbortSignal,
  ): Promise<SearchPersonResult[]>;
  listGrants(
    resourceId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<ResourceShareGrantsPage>;
  resource(
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<{ resource: ResourceView }>;
  grant(
    resourceId: string,
    profileId: string,
    signal?: AbortSignal,
  ): Promise<{ shared: true }>;
  revoke(
    resourceId: string,
    profileId: string,
    signal?: AbortSignal,
  ): Promise<void>;
}

/**
 * Uses the existing authenticated people search and owner-only share routes.
 * No API exists to list an owner's previously granted recipients: the
 * interface must never imply a complete permission directory.
 */
export class MobileResourceDirectSharingApi implements ResourceDirectSharingApi {
  constructor(
    private readonly session: SessionController,
    private readonly client: MobileApiClient,
    private readonly search: Pick<MobileSearchApi, "search">,
    private readonly resources: Pick<ResourceConsumptionApi, "resource">,
  ) {}

  async searchPeople(
    query: string,
    signal?: AbortSignal,
  ): Promise<SearchPersonResult[]> {
    const result = await this.search.search(
      { q: query, scope: "people" },
      signal,
    );
    return result.results.people;
  }

  resource(resourceId: string, signal?: AbortSignal) {
    return this.resources.resource(resourceId, signal);
  }

  listGrants(resourceId: string, cursor?: string, signal?: AbortSignal) {
    return this.authorized((credential) => {
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);
      return this.client.request<ResourceShareGrantsPage>(
        `/resources/${encodeURIComponent(resourceId)}/shares?${params.toString()}`,
        {
          credential,
          ...(signal ? { signal } : {}),
        },
      );
    });
  }

  grant(resourceId: string, profileId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.client.request<{ shared: true }>(
        `/resources/${encodeURIComponent(resourceId)}/shares/${encodeURIComponent(profileId)}`,
        {
          method: "PUT",
          credential,
          ...(signal ? { signal } : {}),
        },
      ),
    );
  }

  revoke(resourceId: string, profileId: string, signal?: AbortSignal) {
    return this.authorized(async (credential) => {
      await this.client.request<void>(
        `/resources/${encodeURIComponent(resourceId)}/shares/${encodeURIComponent(profileId)}`,
        {
          method: "DELETE",
          credential,
          ...(signal ? { signal } : {}),
        },
      );
    });
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
          "Session authority changed while a share operation was in flight",
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
