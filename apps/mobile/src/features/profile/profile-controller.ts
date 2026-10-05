import type {
  OwnerProfileResponse,
  ProfileActivity,
  ProfileActivityPageResponse,
  UpdateProfileInput,
} from "@losapuntes/contracts";

import { ApiRequestError } from "@/services/api/client";

import type {
  CreateProfileActivityInput,
  MobileProfileApiContract,
} from "./profile-api";

export type MobileProfileFailureKind =
  | "offline"
  | "timeout"
  | "server_unavailable"
  | "restricted"
  | "auth_required"
  | "conflict"
  | "validation"
  | "error";

export type MobileProfileFailure = {
  kind: MobileProfileFailureKind;
  code: string | null;
};

export type MobileProfileMutationResult =
  "committed" | "reconciled" | "failed" | "cancelled";

type ReadyOwnerProfile = Extract<
  OwnerProfileResponse,
  { onboardingRequired: false }
>;

export type MobileProfileSnapshot =
  | { kind: "idle" }
  | { kind: "loading"; authorityKey: string }
  | {
      kind: "onboarding";
      authorityKey: string;
      busy: boolean;
      failure: MobileProfileFailure | null;
      notice: string | null;
    }
  | {
      kind: "ready";
      authorityKey: string;
      data: ReadyOwnerProfile;
      busy: boolean;
      loadingMore: boolean;
      failure: MobileProfileFailure | null;
      notice: string | null;
    }
  | {
      kind: "failure";
      authorityKey: string;
      failure: MobileProfileFailure;
    };

type Listener = (snapshot: MobileProfileSnapshot) => void;

type Operation = {
  authorityKey: string;
  generation: number;
  controller: AbortController;
};

export function mobileProfileFailure(error: unknown): MobileProfileFailure {
  if (!(error instanceof ApiRequestError)) {
    return { kind: "error", code: null };
  }
  if (error.code === "ACCOUNT_RESTRICTED") {
    return { kind: "restricted", code: error.code };
  }
  if (error.kind === "offline") return { kind: "offline", code: error.code };
  if (error.kind === "timeout") return { kind: "timeout", code: error.code };
  if (error.kind === "server_unavailable") {
    return { kind: "server_unavailable", code: error.code };
  }
  if (error.kind === "unauthorized") {
    return { kind: "auth_required", code: error.code };
  }
  if (error.kind === "conflict") return { kind: "conflict", code: error.code };
  if (error.kind === "validation") {
    return { kind: "validation", code: error.code };
  }
  if (error.kind === "forbidden") {
    return { kind: "restricted", code: error.code };
  }
  return { kind: "error", code: error.code };
}

function ambiguousFailure(failure: MobileProfileFailure): boolean {
  return (
    failure.kind === "offline" ||
    failure.kind === "timeout" ||
    failure.kind === "server_unavailable"
  );
}

function appendUniqueActivities(
  current: ProfileActivity[],
  next: ProfileActivityPageResponse["items"],
): ProfileActivity[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}

export class MobileProfileController {
  private snapshot: MobileProfileSnapshot = { kind: "idle" };
  private listeners = new Set<Listener>();
  private authorityKey: string | null = null;
  private generation = 0;
  private active: Operation | null = null;

  constructor(private readonly api: MobileProfileApiContract) {}

  getSnapshot(): MobileProfileSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(authorityKey: string): Promise<void> {
    this.authorityKey = authorityKey;
    const operation = this.begin(authorityKey);
    this.publish({ kind: "loading", authorityKey });

    try {
      const response = await this.api.me(operation.controller.signal);
      if (!this.isCurrent(operation)) return;
      this.publishFromOwnerResponse(authorityKey, response, null);
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      this.publish({
        kind: "failure",
        authorityKey,
        failure: mobileProfileFailure(error),
      });
    } finally {
      this.finish(operation);
    }
  }

  async createProfile(
    authorityKey: string,
    displayName: string,
  ): Promise<void> {
    if (
      this.snapshot.kind !== "onboarding" ||
      this.snapshot.authorityKey !== authorityKey ||
      this.snapshot.busy
    ) {
      return;
    }

    await this.mutate(
      authorityKey,
      (signal) => this.api.create(displayName, signal),
      "Perfil creado.",
    );
  }

  async updateProfile(
    authorityKey: string,
    input: UpdateProfileInput,
  ): Promise<void> {
    if (!this.currentReady(authorityKey)) return;

    await this.mutate(
      authorityKey,
      (signal) => this.api.update(input, signal),
      "Perfil actualizado.",
    );
  }

  async createActivity(
    authorityKey: string,
    input: CreateProfileActivityInput,
  ): Promise<MobileProfileMutationResult> {
    if (!this.currentReady(authorityKey)) return "cancelled";

    return this.mutate(
      authorityKey,
      (signal) => this.api.createActivity(input, signal),
      "Actividad agregada.",
    );
  }

  async deleteActivity(
    authorityKey: string,
    activityId: string,
  ): Promise<void> {
    const current = this.currentReady(authorityKey);
    const activity = current?.data.activities.find(
      (candidate) => candidate.id === activityId,
    );
    if (!activity) return;

    await this.mutate(
      authorityKey,
      (signal) => this.api.deleteActivity(activity, signal),
      "Actividad eliminada.",
    );
  }

  async loadMoreActivities(authorityKey: string): Promise<void> {
    const current = this.currentReady(authorityKey);
    if (
      !current ||
      current.busy ||
      current.loadingMore ||
      !current.data.activitiesNextCursor ||
      this.active
    ) {
      return;
    }

    const operation = this.begin(authorityKey);
    this.publish({
      ...current,
      loadingMore: true,
      failure: null,
      notice: null,
    });

    try {
      const page = await this.api.activities(
        current.data.activitiesNextCursor,
        current.data.activitiesLimit,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (!latest) return;

      this.publish({
        ...latest,
        data: {
          ...latest.data,
          activities: appendUniqueActivities(
            latest.data.activities,
            page.items,
          ),
          activitiesNextCursor: page.nextCursor,
        },
        loadingMore: false,
        failure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.currentReady(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          loadingMore: false,
          failure: mobileProfileFailure(error),
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  suspend(authorityKey: string): void {
    if (authorityKey !== this.authorityKey) return;
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;

    if (
      this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
    ) {
      this.publish({
        ...this.snapshot,
        busy: false,
        loadingMore: false,
      });
    } else if (
      this.snapshot.kind === "onboarding" &&
      this.snapshot.authorityKey === authorityKey
    ) {
      this.publish({ ...this.snapshot, busy: false });
    }
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && authorityKey !== this.authorityKey) return;
    this.authorityKey = null;
    this.generation += 1;
    this.active?.controller.abort();
    this.active = null;
    this.publish({ kind: "idle" });
  }

  private async mutate<T>(
    authorityKey: string,
    action: (signal: AbortSignal) => Promise<T>,
    successNotice: string,
  ): Promise<MobileProfileMutationResult> {
    const current = this.currentActionable(authorityKey);
    if (!current || current.busy || this.active) return "cancelled";

    const operation = this.begin(authorityKey);
    this.publish({ ...current, busy: true, failure: null, notice: null });

    try {
      await action(operation.controller.signal);
      if (!this.isCurrent(operation)) return "cancelled";

      const response = await this.api.me(operation.controller.signal);
      if (!this.isCurrent(operation)) return "cancelled";
      this.publishFromOwnerResponse(authorityKey, response, successNotice);
      return "committed";
    } catch (error) {
      if (!this.isCurrent(operation)) return "cancelled";
      const failure = mobileProfileFailure(error);

      if (ambiguousFailure(failure) || failure.kind === "conflict") {
        try {
          const response = await this.api.me(operation.controller.signal);
          if (!this.isCurrent(operation)) return "cancelled";
          this.publishFromOwnerResponse(
            authorityKey,
            response,
            failure.kind === "conflict"
              ? "El perfil cambió en otro lugar. Recargamos la versión confirmada por el servidor; revisala antes de volver a guardar."
              : "La conexión se interrumpió. Recargamos el estado confirmado por el servidor; revisalo antes de repetir la acción.",
          );
          return "reconciled";
        } catch (refreshError) {
          if (!this.isCurrent(operation)) return "cancelled";
          this.publishFailureOnCurrent(
            authorityKey,
            mobileProfileFailure(refreshError),
          );
          return "failed";
        }
      }

      this.publishFailureOnCurrent(authorityKey, failure);
      return "failed";
    } finally {
      this.finish(operation);
    }
  }

  private publishFromOwnerResponse(
    authorityKey: string,
    response: OwnerProfileResponse,
    notice: string | null,
  ): void {
    if (response.onboardingRequired) {
      this.publish({
        kind: "onboarding",
        authorityKey,
        busy: false,
        failure: null,
        notice,
      });
      return;
    }

    this.publish({
      kind: "ready",
      authorityKey,
      data: response,
      busy: false,
      loadingMore: false,
      failure: null,
      notice,
    });
  }

  private publishFailureOnCurrent(
    authorityKey: string,
    failure: MobileProfileFailure,
  ): void {
    const current = this.currentActionable(authorityKey);
    if (!current) return;
    this.publish({ ...current, busy: false, failure, notice: null });
  }

  private currentActionable(
    authorityKey: string,
  ):
    | Extract<MobileProfileSnapshot, { kind: "ready" }>
    | Extract<MobileProfileSnapshot, { kind: "onboarding" }>
    | null {
    if (
      (this.snapshot.kind === "ready" || this.snapshot.kind === "onboarding") &&
      this.snapshot.authorityKey === authorityKey
    ) {
      return this.snapshot;
    }
    return null;
  }

  private currentReady(
    authorityKey: string,
  ): Extract<MobileProfileSnapshot, { kind: "ready" }> | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
      ? this.snapshot
      : null;
  }

  private begin(authorityKey: string): Operation {
    this.authorityKey = authorityKey;
    this.generation += 1;
    this.active?.controller.abort();
    const operation: Operation = {
      authorityKey,
      generation: this.generation,
      controller: new AbortController(),
    };
    this.active = operation;
    return operation;
  }

  private isCurrent(operation: Operation): boolean {
    return (
      this.active === operation &&
      this.authorityKey === operation.authorityKey &&
      this.generation === operation.generation &&
      !operation.controller.signal.aborted
    );
  }

  private finish(operation: Operation): void {
    if (this.active === operation) this.active = null;
  }

  private publish(snapshot: MobileProfileSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
