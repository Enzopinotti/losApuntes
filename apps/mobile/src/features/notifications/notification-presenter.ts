import type { MobileNotificationView } from "@/features/community/community-api";

export type MobileNotificationAction = "open" | "mark_read";

export function mobileNotificationMessage(
  notification: MobileNotificationView,
): string {
  const actor =
    notification.actor?.displayName ?? "Una persona de la comunidad";
  switch (notification.type) {
    case "social.followed":
      return `${actor} empezó a seguirte.`;
    case "social.connection_requested":
      return `${actor} te envió una solicitud de conexión.`;
    case "social.connection_accepted":
      return `${actor} aceptó tu solicitud de conexión.`;
    case "qa.question_answered":
      return `${actor} respondió tu pregunta.`;
    case "qa.answer_accepted":
      return `${actor} aceptó tu respuesta.`;
  }
}

export function mobileNotificationActionLabel(
  action: MobileNotificationAction,
  notification: MobileNotificationView,
): string {
  const message = mobileNotificationMessage(notification);
  return action === "open"
    ? `Abrir: ${message}`
    : `Marcar como leída: ${message}`;
}
