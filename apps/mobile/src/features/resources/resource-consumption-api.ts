import type { ResourceView } from "@losapuntes/contracts";

import { ApiRequestError, type MobileApiClient } from "@/services/api/client";

import type { SessionController } from "../session/session-controller";

export type ResourceAccessResponse = {
  resource: ResourceView;
  file: ResourceView["file"];
  access: {
    url: string;
    expiresAt: string;
  };
};

export type ResourceSavedPage = {
  items: ResourceView[];
  nextCursor: string | null;
};

export interface ResourceConsumptionApi {
  resource(resourceId: string, signal?: AbortSignal): Promise<{ resource: ResourceView }>;
  access(
    resourceId: string,
    disposition: "inline" | "attachment",
    signal?: AbortSignal,
  ): Promise<ResourceAccessResponse>;
  save(resourceId: string, signal?: AbortSignal): Promise<{ saved: true }>;
  unsave(resourceId: string, signal?: AbortSignal): Promise<void>;
  saved(cursor?: string, signal?: AbortSignal): Promise<ResourceSavedPage>;
}

export interface MobileResourceConsumptionTransport {
  resource(
    credential: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<{ resource: ResourceView }>;
  access(
    credential: string,
    resourceId: string,
    disposition: "inline" | "attachment",
    signal?: AbortSignal,
  ): Promise<ResourceAccessResponse>;
  save(
    credential: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<{ saved: true }>;
  unsave(
    credential: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  saved(
    credential: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<ResourceSavedPage>;
}

export class MobileResourceConsumptionHttpTransport
  implements MobileResourceConsumptionTransport
{
  constructor(private readonly client: MobileApiClient) {}

  resource(credential: string, resourceId: string, signal?: AbortSignal) {
    return this.client.request<{ resource: ResourceView }>(
      `/resources/${encodeURIComponent(resourceId)}`,
      {
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  access(
    credential: string,
    resourceId: string,
    disposition: "inline" | "attachment",
    signal?: AbortSignal,
  ) {
    return this.client.request<ResourceAccessResponse>(
      `/resources/${encodeURIComponent(resourceId)}/access`,
      {
        method: "POST",
        credential,
        body: { disposition },
        ...(signal ? { signal } : {}),
      },
    );
  }

  save(credential: string, resourceId: string, signal?: AbortSignal) {
    return this.client.request<{ saved: true }>(
      `/resources/${encodeURIComponent(resourceId)}/save`,
      {
        method: "PUT",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  async unsave(
    credential: string,
    resourceId: string,
    signal?: AbortSignal,
  ) {
    await this.client.request<void>(
      `/resources/${encodeURIComponent(resourceId)}/save`,
      {
        method: "DELETE",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  saved(credential: string, cursor?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: "25" });
    if (cursor) query.set("cursor", cursor);

    return this.client.request<ResourceSavedPage>(
      `/resources/saved?${query.toString()}`,
      {
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }
}

export class MobileResourceConsumptionApi implements ResourceConsumptionApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: MobileResourceConsumptionTransport,
  ) {}

  resource(resourceId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.resource(credential, resourceId, signal),
    );
  }

  access(
    resourceId: string,
    disposition: "inline" | "attachment",
    signal?: AbortSignal,
  ) {
    return this.authorized((credential) =>
      this.transport.access(credential, resourceId, disposition, signal),
    );
  }

  save(resourceId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.save(credential, resourceId, signal),
    );
  }

  unsave(resourceId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.unsave(credential, resourceId, signal),
    );
  }

  saved(cursor?: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.saved(credential, cursor, signal),
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
