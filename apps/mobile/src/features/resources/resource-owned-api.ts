import type {
  OwnedResourcesPage,
  OwnedResourceSubjects,
  ResourceVisibility,
} from "@losapuntes/contracts";

import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "@/features/session/session-controller";

export type OwnedResourcesQuery = {
  visibility?: ResourceVisibility;
  q?: string;
  subjectId?: string;
  order?: "newest" | "oldest";
  cursor?: string;
};

export interface OwnedResourcesApi {
  listSubjects(signal?: AbortSignal): Promise<OwnedResourceSubjects>;
  listOwned(
    input: OwnedResourcesQuery,
    signal?: AbortSignal,
  ): Promise<OwnedResourcesPage>;
}

/**
 * Owner-scoped listing is intentionally distinct from search and saved items.
 * The identity is always taken from the authoritative session credential.
 */
export class MobileOwnedResourcesApi implements OwnedResourcesApi {
  constructor(
    private readonly session: SessionController,
    private readonly client: MobileApiClient,
  ) {}

  async listSubjects(signal?: AbortSignal): Promise<OwnedResourceSubjects> {
    return this.withCredential(
      (credential) => this.client.request<OwnedResourceSubjects>(
        "/resources/mine/subjects",
        {
          credential,
          ...(signal ? { signal } : {}),
        },
      ),
    );
  }

  async listOwned(
    input: OwnedResourcesQuery,
    signal?: AbortSignal,
  ): Promise<OwnedResourcesPage> {
    return this.withCredential((credential) =>
      this.client.request<OwnedResourcesPage>(
        `/resources/mine?${query.toString()}`,
        {
          credential,
          ...(signal ? { signal } : {}),
        },
      ),
    );
  }

  private async withCredential<T>(
    request: (credential: string) => Promise<T>,
  ): Promise<T> {
    const authority = this.session.getCredentialSnapshot();
    if (!authority) {
      throw new ApiRequestError(
        "unauthorized",
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication required",
      );
    }
    const query = new URLSearchParams({ limit: "25" });
    if (input.visibility) query.set("visibility", input.visibility);
    if (input.q) query.set("q", input.q);
    if (input.subjectId) query.set("subjectId", input.subjectId);
    if (input.order) query.set("order", input.order);
    if (input.cursor) query.set("cursor", input.cursor);
    try {
      const page = await request(authority.credential);
      if (
        !this.session.isCredentialAuthoritative(
          authority.credential,
          authority.generation,
        )
      ) {
        throw new ApiRequestError(
          "unauthorized",
          null,
          "STALE_SESSION_AUTHORITY",
          "Session changed while listing owned resources",
        );
      }
      return page;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.kind === "unauthorized") {
          await this.session.invalidateIfAuthoritative(
            authority.credential,
            authority.generation,
          );
        } else if (error.code === "ACCOUNT_RESTRICTED") {
          await this.session.restrictIfAuthoritative(
            authority.credential,
            authority.generation,
          );
        }
      }
      throw error;
    }
  }
}
