import type { OwnedResourceStatistics } from "@losapuntes/contracts";

import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "@/features/session/session-controller";

export interface OwnerStatisticsApi {
  getStatistics(signal?: AbortSignal): Promise<OwnedResourceStatistics>;
}

/**
 * Owner-only aggregate: the server takes the author identity from the
 * credential, and the response cannot outlive that credential's authority.
 */
export class MobileOwnerStatisticsApi implements OwnerStatisticsApi {
  constructor(
    private readonly session: SessionController,
    private readonly client: MobileApiClient,
  ) {}

  async getStatistics(signal?: AbortSignal): Promise<OwnedResourceStatistics> {
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
      const statistics = await this.client.request<OwnedResourceStatistics>(
        "/resources/mine/stats",
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
          "Account changed during statistics request",
        );
      }
      return statistics;
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
