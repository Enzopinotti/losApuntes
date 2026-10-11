import type { MobileNotificationView } from "@/features/community/community-api";

export type MobileNotificationDestination =
  | { kind: "profile"; profileId: string }
  | { kind: "question"; questionId: string }
  | { kind: "connection"; connectionId: string }
  | { kind: "network" };

export function mobileNotificationDestination(
  notification: MobileNotificationView,
): MobileNotificationDestination | null {
  const { type, id } = notification.target;
  if (!id) return null;
  if (type === "profile") return { kind: "profile", profileId: id };
  if (type === "question") return { kind: "question", questionId: id };
  if (type === "connection") return { kind: "connection", connectionId: id };
  if (type === "answer") return { kind: "network" };
  return null;
}
