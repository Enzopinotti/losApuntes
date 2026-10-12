import type {
  OwnedResourcesPage,
  ResourceVisibility,
} from "@losapuntes/contracts";

import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "@/features/session/session-controller";

export type OwnedResourcesQuery = {
  visibility?: ResourceVisibility;
  cursor?: string;
};

export interface OwnedResourcesApi {
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

  async listOwned(
    input: OwnedResourcesQuery,
    signal?: AbortSignal,
  ): Promise<OwnedResourcesPage> {
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
    if (input.cursor) query.set("cursor", input.cursor);
    try {
      const page = await this.client.request<OwnedResourcesPage>(
        `/resources/mine?${query.toString()}`,
        {
          credential: authority.credential,
          ...(signal ? { signal } : {}),
        },
      );
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
