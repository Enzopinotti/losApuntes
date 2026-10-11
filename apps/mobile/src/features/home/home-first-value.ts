import type { FeedItem } from "@losapuntes/contracts";
import type { Href } from "expo-router";

export interface HomeFeedItemAction {
  href: Href;
  accessibilityLabel: string;
  accessibilityHint: string;
}

export function homeFeedItemAction(
  item: Pick<FeedItem, "type" | "id" | "title">,
): HomeFeedItemAction | null {
  if (item.type === "resource") {
    return {
      href: { pathname: "/resources/[id]", params: { id: item.id } },
      accessibilityLabel: `Abrir apunte: ${item.title}`,
      accessibilityHint:
        "Abre el detalle del apunte y vuelve a comprobar los permisos actuales.",
    };
  }

  if (item.type === "question") {
    return {
      href: {
        pathname: "/questions/[questionId]",
        params: { questionId: item.id },
      },
      accessibilityLabel: `Abrir pregunta: ${item.title}`,
      accessibilityHint:
        "Abre la pregunta y vuelve a comprobar el acceso actual.",
    };
  }

  return null;
}

export function hasActionableHomeContent(
  ...feeds: ReadonlyArray<{
    items: ReadonlyArray<Pick<FeedItem, "type">>;
  }>
): boolean {
  return feeds.some((feed) =>
    feed.items.some(
      (item) => item.type === "resource" || item.type === "question",
    ),
  );
}

export interface HomeFeedExploreAction {
  href: Href;
  label: string;
  accessibilityLabel: string;
  accessibilityHint: string;
}

export function homeFeedExploreAction(
  surface: "subjects" | "community" | "for_you",
  hasMore: boolean,
): HomeFeedExploreAction | null {
  if (!hasMore) return null;

  const destination = surface === "community" ? "Red" : "Buscar";
  return {
    href: surface === "community" ? "/(tabs)/network" : "/(tabs)/search",
    label: `Explorar en ${destination}`,
    accessibilityLabel: `Explorar más contenido en ${destination}`,
    accessibilityHint:
      "Abre otra sección para descubrir contenido. No continúa la misma tanda del inicio.",
  };
}

export interface HomeFirstValueAction {
  id: "search" | "question";
  label: string;
  accessibilityLabel: string;
  accessibilityHint: string;
  navigation: "navigate" | "push";
  href: Href;
}

export function homeFirstValueActions(
  hasCurrentSubject: boolean,
): HomeFirstValueAction[] {
  const actions: HomeFirstValueAction[] = [
    {
      id: "search",
      label: "Buscar apuntes",
      accessibilityLabel: "Buscar apuntes y materias",
      accessibilityHint:
        "Abre Buscar para explorar los recursos visibles para tu cuenta.",
      navigation: "navigate",
      href: "/(tabs)/search",
    },
  ];

  if (hasCurrentSubject) {
    actions.push({
      id: "question",
      label: "Hacer una pregunta",
      accessibilityLabel: "Hacer una pregunta sobre una materia actual",
      accessibilityHint:
        "Abre el formulario existente para plantear una pregunta académica.",
      navigation: "push",
      href: "/questions/new",
    });
  }

  return actions;
}
