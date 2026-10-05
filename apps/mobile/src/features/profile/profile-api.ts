import type {
  OwnerProfile,
  OwnerProfileResponse,
  ProfileActivity,
  ProfileActivityPageResponse,
  ProfileActivityType,
  UpdateProfileInput,
} from "@losapuntes/contracts";

import type { SessionController } from "@/features/session/session-controller";
import { ApiRequestError, type MobileApiClient } from "@/services/api/client";

export type CreateProfileActivityInput = {
  type: ProfileActivityType;
  title: string;
  description?: string | null;
  url?: string | null;
  startedOn?: string | null;
  endedOn?: string | null;
};

export interface MobileProfileTransport {
  me(credential: string, signal?: AbortSignal): Promise<OwnerProfileResponse>;
  create(
    credential: string,
    displayName: string,
    signal?: AbortSignal,
  ): Promise<{ profile: OwnerProfile }>;
  update(
    credential: string,
    input: UpdateProfileInput,
    signal?: AbortSignal,
  ): Promise<{ profile: OwnerProfile }>;
  activities(
    credential: string,
    cursor: string | undefined,
    limit: number,
    signal?: AbortSignal,
  ): Promise<ProfileActivityPageResponse>;
  createActivity(
    credential: string,
    input: CreateProfileActivityInput,
    signal?: AbortSignal,
  ): Promise<{ activity: ProfileActivity }>;
  deleteActivity(
    credential: string,
    activity: ProfileActivity,
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface MobileProfileApiContract {
  me(signal?: AbortSignal): Promise<OwnerProfileResponse>;
  create(
    displayName: string,
    signal?: AbortSignal,
  ): Promise<{ profile: OwnerProfile }>;
  update(
    input: UpdateProfileInput,
    signal?: AbortSignal,
  ): Promise<{ profile: OwnerProfile }>;
  activities(
    cursor: string | undefined,
    limit: number,
    signal?: AbortSignal,
  ): Promise<ProfileActivityPageResponse>;
  createActivity(
    input: CreateProfileActivityInput,
    signal?: AbortSignal,
  ): Promise<{ activity: ProfileActivity }>;
  deleteActivity(
    activity: ProfileActivity,
    signal?: AbortSignal,
  ): Promise<void>;
}

export class MobileProfileHttpTransport implements MobileProfileTransport {
  constructor(private readonly client: MobileApiClient) {}

  me(credential: string, signal?: AbortSignal) {
    return this.client.request<OwnerProfileResponse>("/profile/me", {
      credential,
      ...(signal ? { signal } : {}),
    });
  }

  create(credential: string, displayName: string, signal?: AbortSignal) {
    return this.client.request<{ profile: OwnerProfile }>("/profile/me", {
      method: "POST",
      credential,
      body: { displayName },
      ...(signal ? { signal } : {}),
    });
  }

  update(credential: string, input: UpdateProfileInput, signal?: AbortSignal) {
    return this.client.request<{ profile: OwnerProfile }>("/profile/me", {
      method: "PATCH",
      credential,
      body: input,
      ...(signal ? { signal } : {}),
    });
  }

  activities(
    credential: string,
    cursor: string | undefined,
    limit: number,
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);

    return this.client.request<ProfileActivityPageResponse>(
      `/profile/me/activities?${query.toString()}`,
      {
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }

  createActivity(
    credential: string,
    input: CreateProfileActivityInput,
    signal?: AbortSignal,
  ) {
    return this.client.request<{ activity: ProfileActivity }>(
      "/profile/me/activities",
      {
        method: "POST",
        credential,
        body: input,
        ...(signal ? { signal } : {}),
      },
    );
  }

  async deleteActivity(
    credential: string,
    activity: ProfileActivity,
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams({
      expectedRevision: String(activity.revision),
    });
    await this.client.request<void>(
      `/profile/me/activities/${encodeURIComponent(activity.id)}?${query.toString()}`,
      {
        method: "DELETE",
        credential,
        ...(signal ? { signal } : {}),
      },
    );
  }
}

export class MobileProfileApi implements MobileProfileApiContract {
  constructor(
    private readonly session: SessionController,
    private readonly transport: MobileProfileTransport,
  ) {}

  me(signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.me(credential, signal),
    );
  }

  create(displayName: string, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.create(credential, displayName, signal),
    );
  }

  update(input: UpdateProfileInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.update(credential, input, signal),
    );
  }

  activities(cursor: string | undefined, limit: number, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.activities(credential, cursor, limit, signal),
    );
  }

  createActivity(input: CreateProfileActivityInput, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.createActivity(credential, input, signal),
    );
  }

  deleteActivity(activity: ProfileActivity, signal?: AbortSignal) {
    return this.authorized((credential) =>
      this.transport.deleteActivity(credential, activity, signal),
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
