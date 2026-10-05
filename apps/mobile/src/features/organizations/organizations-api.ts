import type {
  OrganizationDetail,
  OrganizationEventPage,
  OrganizationPostPage,
  OrganizationSearchPage,
  OrganizationType,
} from "@losapuntes/contracts";

import type { SessionController } from "@/features/session/session-controller";
import { ApiRequestError, type MobileApiClient } from "@/services/api/client";

export type OrganizationDirectoryInput = {
  q?: string;
  type?: OrganizationType;
  cursor?: string;
};

export interface MobileOrganizationsTransport {
  search(
    credential: string,
    input: OrganizationDirectoryInput,
    signal?: AbortSignal,
  ): Promise<OrganizationSearchPage>;
  get(
    credential: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<{ organization: OrganizationDetail }>;
  follow(
    credential: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<{ following: true; changed: boolean }>;
  unfollow(
    credential: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<{ following: false; changed: boolean }>;
  posts(
    credential: string,
    id: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<OrganizationPostPage>;
  events(
    credential: string,
    id: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<OrganizationEventPage>;
}

export interface MobileOrganizationsApiContract {
  search(
    input: OrganizationDirectoryInput,
    signal?: AbortSignal,
  ): Promise<OrganizationSearchPage>;
  get(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ organization: OrganizationDetail }>;
  follow(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ following: true; changed: boolean }>;
  unfollow(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ following: false; changed: boolean }>;
  posts(
    id: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<OrganizationPostPage>;
  events(
    id: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<OrganizationEventPage>;
}

export class MobileOrganizationsHttpTransport implements MobileOrganizationsTransport {
  constructor(private readonly client: MobileApiClient) {}

  search(
    credential: string,
    input: OrganizationDirectoryInput,
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({ limit: "25" });
    if (input.q) query.set("q", input.q);
    if (input.type) query.set("type", input.type);
    if (input.cursor) query.set("cursor", input.cursor);

    return this.client.request<OrganizationSearchPage>(
      `/organizations?${query.toString()}`,
      {
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  get(credential: string, id: string, signal?: AbortSignal) {
    return this.client.request<{ organization: OrganizationDetail }>(
      `/organizations/${encodeURIComponent(id)}`,
      {
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  follow(credential: string, id: string, signal?: AbortSignal) {
    return this.client.request<{ following: true; changed: boolean }>(
      `/organizations/${encodeURIComponent(id)}/follow`,
      {
        method: "PUT",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  unfollow(credential: string, id: string, signal?: AbortSignal) {
    return this.client.request<{ following: false; changed: boolean }>(
      `/organizations/${encodeURIComponent(id)}/follow`,
      {
        method: "DELETE",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  posts(credential: string, id: string, cursor?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: "20" });
    if (cursor) query.set("cursor", cursor);

    return this.client.request<OrganizationPostPage>(
      `/organizations/${encodeURIComponent(id)}/posts?${query.toString()}`,
      {
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  events(
    credential: string,
    id: string,
    cursor?: string,
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({ limit: "20" });
    if (cursor) query.set("cursor", cursor);

    return this.client.request<OrganizationEventPage>(
      `/organizations/${encodeURIComponent(id)}/events?${query.toString()}`,
      {
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }
}

export class MobileOrganizationsApi implements MobileOrganizationsApiContract {
  constructor(
    private readonly session: SessionController,
    private readonly transport: MobileOrganizationsTransport,
  ) {}

  search(input: OrganizationDirectoryInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.search(credential, input, signal),
    );
  }

  get(id: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.get(credential, id, signal),
    );
  }

  follow(id: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.follow(credential, id, signal),
    );
  }

  unfollow(id: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.unfollow(credential, id, signal),
    );
  }

  posts(id: string, cursor?: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.posts(credential, id, cursor, signal),
    );
  }

  events(id: string, cursor?: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.events(credential, id, cursor, signal),
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
