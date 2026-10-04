import type { ResourceView } from "@losapuntes/contracts";

import { ApiRequestError, type MobileApiClient } from "@/services/api/client";

import type { SessionController } from "../session/session-controller";
import type {
  CreateMobileResourceInput,
  ResourceUploadIntent,
} from "./resource-types";

export interface MobileResourceTransport {
  createUploadIntent(
    credential: string,
    input: {
      operationKey: string;
      filename: string;
      mimeType: string;
      byteSize: number;
    },
    signal?: AbortSignal,
  ): Promise<ResourceUploadIntent>;
  finalize(
    credential: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  create(
    credential: string,
    input: CreateMobileResourceInput,
    signal?: AbortSignal,
  ): Promise<{ resource: ResourceView }>;
}

export class MobileResourceHttpTransport implements MobileResourceTransport {
  constructor(private readonly client: MobileApiClient) {}

  createUploadIntent(
    credential: string,
    input: {
      operationKey: string;
      filename: string;
      mimeType: string;
      byteSize: number;
    },
    signal?: AbortSignal,
  ) {
    return this.client.request<ResourceUploadIntent>("/files/upload-intents", {
      method: "POST",
      credential,
      body: input,
      ...(signal ? { signal } : {}),
    });
  }

  async finalize(credential: string, fileId: string, signal?: AbortSignal) {
    await this.client.request<{ file: { id: string; state: "ready" } }>(
      `/files/${encodeURIComponent(fileId)}/finalize`,
      {
        method: "POST",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  create(
    credential: string,
    input: CreateMobileResourceInput,
    signal?: AbortSignal,
  ) {
    return this.client.request<{ resource: ResourceView }>("/resources", {
      method: "POST",
      credential,
      body: input,
      ...(signal ? { signal } : {}),
    });
  }
}

export class MobileResourceApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: MobileResourceTransport,
  ) {}

  createUploadIntent(
    input: {
      operationKey: string;
      filename: string;
      mimeType: string;
      byteSize: number;
    },
    signal?: AbortSignal,
  ) {
    return this.authorized((credential) =>
      this.transport.createUploadIntent(credential, input, signal),
    );
  }

  finalize(fileId: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.finalize(credential, fileId, signal),
    );
  }

  create(input: CreateMobileResourceInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.create(credential, input, signal),
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
