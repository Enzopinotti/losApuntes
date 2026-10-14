import type { FeedItem, FeedReasonCode } from "@losapuntes/contracts";

const reasonLabels: Record<FeedReasonCode, string> = {
  current_subject: "De tu materia actual",
  prioritized_subject: "De una materia priorizada",
  connection: "De una conexión",
  following: "De alguien que seguís",
  organization_following: "De una organización que seguís",
  interest_match: "Relacionado con tus intereses",
  unanswered_question: "Pregunta sin responder",
  fresh: "Publicado recientemente",
  explicit_more: "Por tu preferencia de ver más",
  exploration: "Para descubrir contenido",
};

export function homeFeedReasonLabels(
  reasons: readonly FeedReasonCode[],
): string[] {
  return reasons.map((reason) => reasonLabels[reason]);
}

export function homeFeedAvatarUrl(
  item: Pick<FeedItem, "author" | "source">,
): string | null {
  return item.source.kind === "campus_organization"
    ? item.source.organization.avatarUrl
    : item.author.avatarUrl;
}

export function homeFeedReasonAccessibilitySummary(
  reasons: readonly FeedReasonCode[],
): string | null {
  const labels = homeFeedReasonLabels(reasons);
  return labels.length > 0 ? `Aparece porque: ${labels.join(", ")}.` : null;
}

export function homeFeedOrganizationVerificationLabel(
  source: FeedItem["source"],
): string | null {
  return source.kind === "campus_organization" &&
    source.organization.verificationState === "verified"
    ? "Organización verificada"
    : null;
}
