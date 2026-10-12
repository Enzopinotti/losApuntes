const feedTypeLabels = {
  resource: "Apunte",
  question: "Pregunta",
  organization_post: "Organización",
};

const feedReasonLabels = {
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

export function presentFeedItem(item, reasonLimit = Number.POSITIVE_INFINITY) {
  const organization =
    item.source.kind === "campus_organization"
      ? item.source.organization
      : null;
  const date = new Date(item.createdAt);
  const reasonCount = Number.isFinite(reasonLimit)
    ? Math.max(0, Math.floor(reasonLimit))
    : item.why.length;

  let href;
  let actionLabel;
  if (item.type === "question") {
    href = `/questions?id=${encodeURIComponent(item.id)}`;
    actionLabel = "Abrir pregunta";
  } else if (item.type === "organization_post" && organization !== null) {
    href = `/organizations/${encodeURIComponent(organization.id)}`;
    actionLabel = "Ver organización";
  } else {
    href = `/resources?q=${encodeURIComponent(item.title)}${
      item.academic.subject
        ? `&subjectId=${encodeURIComponent(item.academic.subject.id)}`
        : ""
    }`;
    actionLabel = "Buscar apunte";
  }

  return {
    kindLabel: feedTypeLabels[item.type],
    displayName: organization?.name ?? item.author.displayName,
    avatarUrl: organization ? organization.avatarUrl : item.author.avatarUrl,
    subjectName: item.academic.subject?.name ?? null,
    verifiedOrganization: organization?.verificationState === "verified",
    reasonLabels: item.why
      .slice(0, reasonCount)
      .map((reason) => feedReasonLabels[reason])
      .filter(Boolean),
    createdAtLabel: Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString("es-AR"),
    href,
    actionLabel,
  };
}
