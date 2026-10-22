import type { ResourceView } from "@losapuntes/contracts";

import { ApiRequestError, type MobileApiClient } from "@/services/api/client";
import type { SessionController } from "@/features/session/session-controller";

export type StudyCollection = {
  id: string;
  title: string;
  description: string | null;
  resourceCount: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type CollectionResourceItem = {
  resourceId: string;
  resource: ResourceView | null;
};

export type StudyCollectionPage = {
  items: StudyCollection[];
  nextCursor: string | null;
};

export type CollectionResourcesPage = {
  items: CollectionResourceItem[];
  nextCursor: string | null;
  revision: number;
};

export interface StudyCollectionsTransport {
  list(
    credential: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<StudyCollectionPage>;
  get(
    credential: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<{ collection: StudyCollection }>;
  resources(
    credential: string,
    id: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<CollectionResourcesPage>;
  create(
    credential: string,
    input: { operationKey: string; title: string; description?: string },
    signal?: AbortSignal,
  ): Promise<{ collection: StudyCollection }>;
  update(
    credential: string,
    id: string,
    input: { expectedRevision: number; title?: string; description?: string },
    signal?: AbortSignal,
  ): Promise<{ collection: StudyCollection }>;
  delete(credential: string, id: string, signal?: AbortSignal): Promise<void>;
  add(
    credential: string,
    id: string,
    resourceId: string,
    signal?: AbortSignal,
  ): Promise<{ collection: StudyCollection }>;
  remove(
    credential: string,
    id: string,
    resourceId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ): Promise<{ collection: StudyCollection }>;
}

export class StudyCollectionsHttpTransport implements StudyCollectionsTransport {
  constructor(private readonly client: MobileApiClient) {}

  list(credential: string, cursor?: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: "25" });
    if (cursor) query.set("cursor", cursor);
    return this.client.request<StudyCollectionPage>(
      `/study-collections?${query.toString()}`,
      { credential, ...(signal ? { signal } : {}) },
    );
  }

  get(credential: string, id: string, signal?: AbortSignal) {
    return this.client.request<{ collection: StudyCollection }>(
      `/study-collections/${encodeURIComponent(id)}`,
      { credential, ...(signal ? { signal } : {}) },
    );
  }

  resources(
    credential: string,
    id: string,
    cursor?: string,
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({ limit: "25" });
    if (cursor) query.set("cursor", cursor);
    return this.client.request<CollectionResourcesPage>(
      `/study-collections/${encodeURIComponent(id)}/resources?${query.toString()}`,
      { credential, ...(signal ? { signal } : {}) },
    );
  }

  create(
    credential: string,
    input: { operationKey: string; title: string; description?: string },
    signal?: AbortSignal,
  ) {
    return this.client.request<{ collection: StudyCollection }>(
      "/study-collections",
      {
        method: "POST",
        credential,
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }

  update(
    credential: string,
    id: string,
    input: { expectedRevision: number; title?: string; description?: string },
    signal?: AbortSignal,
  ) {
    return this.client.request<{ collection: StudyCollection }>(
      `/study-collections/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        credential,
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }

  async delete(credential: string, id: string, signal?: AbortSignal) {
    await this.client.request<void>(
      `/study-collections/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  add(
    credential: string,
    id: string,
    resourceId: string,
    signal?: AbortSignal,
  ) {
    return this.client.request<{ collection: StudyCollection }>(
      `/study-collections/${encodeURIComponent(id)}/resources/${encodeURIComponent(resourceId)}`,
      { method: "PUT", credential, ...(signal ? { signal } : {}) },
    );
  }

  remove(
    credential: string,
    id: string,
    resourceId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({
      expectedRevision: String(expectedRevision),
    });
    return this.client.request<{ collection: StudyCollection }>(
      `/study-collections/${encodeURIComponent(id)}/resources/${encodeURIComponent(resourceId)}?${query.toString()}`,
      { method: "DELETE", credential, ...(signal ? { signal } : {}) },
    );
  }
}

export class MobileStudyCollectionsApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: StudyCollectionsTransport,
  ) {}

  list(cursor?: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.list(credential, cursor, signal),
    );
  }

  get(id: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.get(credential, id, signal),
    );
  }

  resources(id: string, cursor?: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.resources(credential, id, cursor, signal),
    );
  }

  create(
    input: { operationKey: string; title: string; description?: string },
    signal?: AbortSignal,
  ) {
    return this.authorized((credential) =>
      this.transport.create(credential, input, signal),
    );
  }

  update(
    id: string,
    input: { expectedRevision: number; title?: string; description?: string },
    signal?: AbortSignal,
  ) {
    return this.authorized((credential) =>
      this.transport.update(credential, id, input, signal),
    );
  }

  delete(id: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.delete(credential, id, signal),
    );
  }

  add(id: string, resourceId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.add(credential, id, resourceId, signal),
    );
  }

  remove(
    id: string,
    resourceId: string,
    expectedRevision: number,
    signal?: AbortSignal,
  ) {
    return this.authorized((credential) =>
      this.transport.remove(
        credential,
        id,
        resourceId,
        expectedRevision,
        signal,
      ),
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
