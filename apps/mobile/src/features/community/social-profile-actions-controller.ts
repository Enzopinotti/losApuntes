import type { ConnectionView } from "@losapuntes/contracts/social-qa";

import {
  communityFailure,
  isAmbiguousCommunityMutationFailure,
  type CommunityFailure,
} from "./community-controller";
import type {
  ProfileRelationshipResponse,
  SocialConnectionsApi,
  SocialFollowingApi,
  SocialProfileRelationshipApi,
} from "./community-api";

const RECONCILIATION_LIMIT = 100;

export type SocialProfileActionsSnapshot =
  | { kind: "idle" }
  | {
      kind: "ready";
      authorityKey: string;
      profileId: string;
      connection:
        | ConnectionView
        | NonNullable<ProfileRelationshipResponse["connection"]>
        | null;
      following: boolean;
      followsYou: boolean;
      isSelf: boolean;
      relationshipLoaded: boolean;
      relationshipLoading: boolean;
      relationshipFailure: CommunityFailure | null;
      followBusy: boolean;
      followFailure: CommunityFailure | null;
      followNotice: string | null;
      busy: boolean;
      reconciling: boolean;
      reconciliationRequired: boolean;
      failure: CommunityFailure | null;
      notice: string | null;
    };

type Operation = {
  authorityKey: string;
  profileId: string;
  generation: number;
  controller: AbortController;
};

type Listener = (snapshot: SocialProfileActionsSnapshot) => void;

export function socialProfileConnectionNotice(
  connection: Pick<ConnectionView, "status" | "incoming" | "requestedByMe">,
): string {
  if (connection.status === "accepted") {
    return "Ya tienen una conexión aceptada.";
  }
  if (connection.status === "pending" && connection.incoming) {
    return "Esta persona ya te envió una solicitud. Podés responderla en Tu red.";
  }
  if (connection.status === "pending" && connection.requestedByMe) {
    return "La solicitud ya está enviada. Esperá la respuesta.";
  }
  return "La relación no está activa. Podés enviar una nueva solicitud si querés.";
}

export class SocialProfileActionsController {
  private authorityKey: string | null = null;
  private profileId: string | null = null;
  private generation = 0;
  private operation: Operation | null = null;
  private snapshot: SocialProfileActionsSnapshot = { kind: "idle" };
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly api: SocialConnectionsApi &
      Pick<SocialFollowingApi, "followProfile"> &
      SocialProfileRelationshipApi,
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): SocialProfileActionsSnapshot {
    return this.snapshot;
  }

  setAuthority(authorityKey: string | null, profileId: string): void {
    if (this.authorityKey === authorityKey && this.profileId === profileId) {
      return;
    }
    this.cancelOperation();
    this.generation += 1;
    this.authorityKey = authorityKey;
    this.profileId = profileId;
    this.publish(
      authorityKey
        ? {
            kind: "ready",
            authorityKey,
            profileId,
            connection: null,
            following: false,
            followsYou: false,
            isSelf: false,
            relationshipLoaded: false,
            relationshipLoading: true,
            relationshipFailure: null,
            followBusy: false,
            followFailure: null,
            followNotice: null,
            busy: false,
            reconciling: false,
            reconciliationRequired: false,
            failure: null,
            notice: null,
          }
        : { kind: "idle" },
    );
  }

  async loadRelationship(authorityKey: string): Promise<void> {
    const current = this.ready(authorityKey);
    if (!current || this.operation) return;

    const operation = this.begin(authorityKey, current.profileId);
    if (!operation) return;
    this.publish({
      ...current,
      relationshipLoading: true,
      relationshipFailure: null,
    });

    try {
      const relationship = await this.api.profileRelationship(
        current.profileId,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        connection: relationship.connection,
        following: relationship.isFollowing,
        followsYou: relationship.followsYou,
        isSelf: relationship.isSelf,
        relationshipLoaded: true,
        relationshipLoading: false,
        relationshipFailure: null,
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        relationshipLoaded: false,
        relationshipLoading: false,
        relationshipFailure: communityFailure(error),
      });
    } finally {
      this.finish(operation);
    }
  }

  async requestConnection(authorityKey: string): Promise<void> {
    const current = this.ready(authorityKey);
    if (
      !current ||
      !current.relationshipLoaded ||
      current.relationshipLoading ||
      current.isSelf ||
      current.busy ||
      current.reconciling ||
      current.reconciliationRequired ||
      this.operation ||
      current.connection?.status === "pending" ||
      current.connection?.status === "accepted"
    ) {
      return;
    }

    const operation = this.begin(authorityKey, current.profileId);
    if (!operation) return;
    this.publish({
      ...current,
      busy: true,
      failure: null,
      notice: null,
    });

    try {
      const response = await this.api.requestConnection(
        current.profileId,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        connection: response.connection,
        relationshipLoaded: true,
        busy: false,
        failure: null,
        notice: socialProfileConnectionNotice(response.connection),
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const failure = communityFailure(error);
      if (isAmbiguousCommunityMutationFailure(failure)) {
        await this.reconcileMutation(operation, failure);
      } else {
        const latest = this.ready(authorityKey);
        if (latest) {
          this.publish({
            ...latest,
            busy: false,
            failure,
            notice: null,
          });
        }
      }
    } finally {
      this.finish(operation);
    }
  }

  async followProfile(authorityKey: string): Promise<void> {
    const current = this.ready(authorityKey);
    if (
      !current ||
      !current.relationshipLoaded ||
      current.relationshipLoading ||
      current.isSelf ||
      current.following ||
      current.followBusy ||
      current.busy ||
      current.reconciling ||
      this.operation
    ) {
      return;
    }

    const operation = this.begin(authorityKey, current.profileId);
    if (!operation) return;
    this.publish({
      ...current,
      followBusy: true,
      followFailure: null,
      followNotice: null,
    });

    try {
      await this.api.followProfile(
        current.profileId,
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (!latest) return;
      this.publish({
        ...latest,
        following: true,
        relationshipLoaded: true,
        followBusy: false,
        followFailure: null,
        followNotice: "El servidor confirma que ahora seguís este perfil.",
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const latest = this.ready(authorityKey);
      if (latest) {
        this.publish({
          ...latest,
          followBusy: false,
          followFailure: communityFailure(error),
          followNotice: null,
        });
      }
    } finally {
      this.finish(operation);
    }
  }

  async reconcile(authorityKey: string): Promise<void> {
    const current = this.ready(authorityKey);
    if (
      !current ||
      !current.reconciliationRequired ||
      current.busy ||
      current.reconciling ||
      this.operation
    ) {
      return;
    }

    const operation = this.begin(authorityKey, current.profileId);
    if (!operation) return;
    this.publish({ ...current, reconciling: true, failure: null });
    await this.reconcileInventory(operation, null);
    this.finish(operation);
  }

  invalidate(authorityKey?: string): void {
    if (authorityKey && this.authorityKey !== authorityKey) return;
    this.cancelOperation();
    this.generation += 1;
    this.authorityKey = null;
    this.profileId = null;
    this.publish({ kind: "idle" });
  }

  private async reconcileMutation(
    operation: Operation,
    mutationFailure: CommunityFailure,
  ): Promise<void> {
    await this.reconcileInventory(operation, mutationFailure);
  }

  private async reconcileInventory(
    operation: Operation,
    mutationFailure: CommunityFailure | null,
  ): Promise<void> {
    try {
      const page = await this.api.connections(
        { limit: RECONCILIATION_LIMIT },
        operation.controller.signal,
      );
      if (!this.isCurrent(operation)) return;
      const current = this.ready(operation.authorityKey);
      if (!current) return;
      const connection = page.items.find(
        (candidate) => candidate.other.profileId === operation.profileId,
      );

      if (!connection) {
        this.publish({
          ...current,
          connection: null,
          relationshipLoaded: true,
          relationshipLoading: false,
          busy: false,
          reconciling: false,
          reconciliationRequired: true,
          failure: mutationFailure,
          notice:
            "No pudimos confirmar la solicitud en la primera página de tu red. Revisá Tu red antes de volver a intentar.",
        });
        return;
      }

      this.publish({
        ...current,
        connection,
        relationshipLoaded: true,
        relationshipLoading: false,
        busy: false,
        reconciling: false,
        reconciliationRequired: false,
        failure: null,
        notice: socialProfileConnectionNotice(connection),
      });
    } catch (error) {
      if (!this.isCurrent(operation)) return;
      const current = this.ready(operation.authorityKey);
      if (!current) return;
      this.publish({
        ...current,
        busy: false,
        reconciling: false,
        reconciliationRequired: true,
        failure: communityFailure(error),
        notice:
          "No pudimos verificar la solicitud. Abrí Tu red y revisá su estado antes de volver a intentar.",
      });
    }
  }

  private ready(
    authorityKey: string,
  ): Extract<SocialProfileActionsSnapshot, { kind: "ready" }> | null {
    return this.snapshot.kind === "ready" &&
      this.snapshot.authorityKey === authorityKey
      ? this.snapshot
      : null;
  }

  private begin(authorityKey: string, profileId: string): Operation | null {
    if (
      this.authorityKey !== authorityKey ||
      this.profileId !== profileId ||
      this.operation
    ) {
      return null;
    }
    const operation: Operation = {
      authorityKey,
      profileId,
      generation: this.generation,
      controller: new AbortController(),
    };
    this.operation = operation;
    return operation;
  }

  private finish(operation: Operation): void {
    if (this.operation === operation) this.operation = null;
  }

  private cancelOperation(): void {
    this.operation?.controller.abort();
    this.operation = null;
  }

  private isCurrent(operation: Operation): boolean {
    return (
      this.operation === operation &&
      this.generation === operation.generation &&
      this.authorityKey === operation.authorityKey &&
      this.profileId === operation.profileId
    );
  }

  private publish(snapshot: SocialProfileActionsSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
