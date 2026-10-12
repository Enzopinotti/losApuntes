export function homeFeedEmptyGuidance(intent, homeFeedKind) {
  if (intent === "contextual" && homeFeedKind === "community") {
    return {
      message: "Todavía no hay publicaciones de tu comunidad en esta vista.",
      href: "/network",
      actionLabel: "Explorar mi red",
    };
  }

  return {
    message: "Todavía no hay publicaciones para esta vista por ahora.",
    href: "/search",
    actionLabel: "Buscar contenido",
  };
}
