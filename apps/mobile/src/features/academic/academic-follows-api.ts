import type {
  AcademicCatalogNode,
  AcademicCatalogSearchInput,
  AcademicCatalogSearchResponse,
} from "@losapuntes/contracts";

import type { SessionController } from "@/features/session/session-controller";
import { ApiRequestError } from "@/services/api/client";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FOLLOW_KINDS = new Set(["institution", "program"]);

export interface AcademicFollow {
  targetId: string;
  kind: "institution" | "program";
  name: string;
}

export interface AcademicFollowListResponse {
  follows: AcademicFollow[];
  truncated: boolean;
  limit: number;
}

export interface AcademicFollowMutationResponse {
  following: true;
  target: { id: string; kind: AcademicFollow["kind"]; name: string };
}

export interface AcademicFollowsTransport {
  academicFollows(credential: string, signal?: AbortSignal): Promise<unknown>;
  academicCatalogSearch(
    input: AcademicCatalogSearchInput,
    signal?: AbortSignal,
  ): Promise<unknown>;
  followAcademicNode(
    credential: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
  unfollowAcademicNode(
    credential: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<void>;
}

const invalidResponse = (): ApiRequestError =>
  new ApiRequestError(
    "unexpected",
    null,
    "ACADEMIC_FOLLOW_RESPONSE_INVALID",
    "The academic follow response is invalid",
  );

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const followKind = (value: unknown): value is AcademicFollow["kind"] =>
  typeof value === "string" && FOLLOW_KINDS.has(value);

const normalizedName = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 200 ? name : null;
};

export function parseAcademicFollows(
  value: unknown,
): AcademicFollowListResponse {
  if (
    !record(value) ||
    !Array.isArray(value.follows) ||
    typeof value.truncated !== "boolean" ||
    !Number.isInteger(value.limit) ||
    (value.limit as number) < 1 ||
    (value.limit as number) > 100 ||
    value.follows.length > (value.limit as number)
  ) {
    throw invalidResponse();
  }

  const seen = new Set<string>();
  const follows = value.follows.map((item): AcademicFollow => {
    if (
      !record(item) ||
      typeof item.targetId !== "string" ||
      !UUID_V4.test(item.targetId) ||
      !followKind(item.kind)
    ) {
      throw invalidResponse();
    }
    const name = normalizedName(item.name);
    const targetId = item.targetId.toLowerCase();
    if (!name || seen.has(targetId)) throw invalidResponse();
    seen.add(targetId);
    return { targetId, kind: item.kind, name };
  });

  return {
    follows,
    truncated: value.truncated,
    limit: value.limit as number,
  };
}

export function parseAcademicCatalogSearch(
  value: unknown,
  expectedKind: AcademicFollow["kind"],
): AcademicCatalogSearchResponse {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 25 ||
    !(
      value.nextCursor === null ||
      (typeof value.nextCursor === "string" &&
        value.nextCursor.length >= 4 &&
        value.nextCursor.length <= 512)
    )
  ) {
    throw invalidResponse();
  }

  const items = value.items.map((item): AcademicCatalogNode => {
    if (
      !record(item) ||
      typeof item.id !== "string" ||
      !UUID_V4.test(item.id) ||
      item.kind !== expectedKind ||
      item.status !== "active" ||
      !Array.isArray(item.parentIds) ||
      !item.parentIds.every(
        (parentId) => typeof parentId === "string" && UUID_V4.test(parentId),
      )
    ) {
      throw invalidResponse();
    }
    const name = normalizedName(item.name);
    if (!name) throw invalidResponse();
    return {
      id: item.id.toLowerCase(),
      kind: expectedKind,
      name,
      parentIds: item.parentIds.map((id) => (id as string).toLowerCase()),
      status: "active",
    };
  });

  return { items, nextCursor: value.nextCursor };
}

function parseFollowMutation(value: unknown): AcademicFollowMutationResponse {
  if (!record(value) || value.following !== true || !record(value.target)) {
    throw invalidResponse();
  }
  const { id, kind, name: rawName } = value.target;
  const name = normalizedName(rawName);
  if (
    typeof id !== "string" ||
    !UUID_V4.test(id) ||
    !followKind(kind) ||
    !name
  ) {
    throw invalidResponse();
  }
  return {
    following: true,
    target: { id: id.toLowerCase(), kind, name },
  };
}

export class AcademicFollowsMobileApi {
  constructor(
    private readonly session: SessionController,
    private readonly transport: AcademicFollowsTransport,
  ) {}

  async list(signal?: AbortSignal): Promise<AcademicFollowListResponse> {
    return parseAcademicFollows(
      await this.authorized((credential) =>
        this.transport.academicFollows(credential, signal),
      ),
    );
  }

  async search(
    kind: AcademicFollow["kind"],
    query: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<AcademicCatalogSearchResponse> {
    const input: AcademicCatalogSearchInput = {
      kind,
      q: query,
      limit: 25,
      ...(cursor ? { cursor } : {}),
    };
    return parseAcademicCatalogSearch(
      await this.transport.academicCatalogSearch(input, signal),
      kind,
    );
  }

  async follow(
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<AcademicFollowMutationResponse> {
    return parseFollowMutation(
      await this.authorized((credential) =>
        this.transport.followAcademicNode(credential, nodeId, signal),
      ),
    );
  }

  unfollow(nodeId: string, signal?: AbortSignal): Promise<void> {
    return this.authorized((credential) =>
      this.transport.unfollowAcademicNode(credential, nodeId, signal),
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
