import type { ResourceView } from "@losapuntes/contracts";

import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "../session/session-controller";
import type { ResourceEditPatch } from "./resource-edit-policy";

export interface ResourceEditApi {
  update(
    resourceId: string,
    patch: ResourceEditPatch,
    signal?: AbortSignal,
  ): Promise<{ resource: ResourceView }>;
}

/** PATCH uses the same generation-fenced session authority as resource reads. */
export class MobileResourceEditApi implements ResourceEditApi {
  constructor(
    private readonly session: SessionController,
    private readonly client: MobileApiClient,
  ) {}

  async update(
    resourceId: string,
    patch: ResourceEditPatch,
    signal?: AbortSignal,
  ): Promise<{ resource: ResourceView }> {
    const authority = this.session.getCredentialSnapshot();
    if (!authority) {
      throw new ApiRequestError(
        "unauthorized",
        401,
        "AUTHENTICATION_REQUIRED",
        "Authentication required",
      );
    }

    try {
      const result = await this.client.request<{ resource: ResourceView }>(
        `/resources/${encodeURIComponent(resourceId)}`,
        {
          method: "PATCH",
          credential: authority.credential,
          body: patch,
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
          "Session changed while editing the resource",
        );
      }
      return result;
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
