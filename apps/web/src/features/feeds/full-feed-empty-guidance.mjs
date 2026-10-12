export function fullFeedEmptyGuidance(view, mode) {
  if (view === "academic") {
    return {
      message: "Podés buscar apuntes, preguntas y materias en Los Apuntes.",
      href: "/search",
      actionLabel: "Buscar contenido",
    };
  }

  if (mode === "community") {
    return {
      message: "Podés explorar las personas y relaciones de tu red.",
      href: "/network",
      actionLabel: "Explorar mi red",
    };
  }

  return {
    message: "Podés ampliar la búsqueda a otros contenidos disponibles.",
    href: "/search",
    actionLabel: "Buscar contenido",
  };
}
