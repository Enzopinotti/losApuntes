import type { FeedItem } from "@losapuntes/contracts";
import type { Href } from "expo-router";

export interface HomeFeedItemAction {
  href: Href;
  accessibilityLabel: string;
  accessibilityHint: string;
}

export interface HomeFeedAuthorAction {
  href: Href;
  accessibilityLabel: string;
  accessibilityHint: string;
}

export function homeFeedAuthorAction(
  item: Pick<FeedItem, "type" | "author" | "source">,
): HomeFeedAuthorAction | null {
  const profileId = item.author.profileId;
  if (
    item.type === "organization_post" ||
    item.source.kind !== "personal_user" ||
    !profileId ||
    profileId.trim() !== profileId
  ) {
    return null;
  }

  const displayName = item.author.displayName.trim() || "esta persona";
  return {
    href: { pathname: "/profiles/[profileId]", params: { profileId } },
    accessibilityLabel: `Ver perfil de ${displayName}`,
    accessibilityHint:
      "Abre el perfil público y vuelve a comprobar los permisos actuales.",
  };
}

export function homeFeedItemAction(
  item: Pick<FeedItem, "type" | "id" | "title"> &
    Partial<Pick<FeedItem, "source">>,
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

  if (
    item.type === "organization_post" &&
    item.source?.kind === "campus_organization"
  ) {
    return {
      href: {
        pathname: "/organizations/[organizationId]",
        params: { organizationId: item.source.organization.id },
      },
      accessibilityLabel: `Ver organización: ${item.source.organization.name}`,
      accessibilityHint:
        "Abre la página de la organización y vuelve a comprobar el contenido disponible.",
    };
  }

  return null;
}

export function hasActionableHomeContent(
  ...feeds: ReadonlyArray<{
    items: ReadonlyArray<
      Pick<FeedItem, "type"> & Partial<Pick<FeedItem, "source">>
    >;
  }>
): boolean {
  return feeds.some((feed) =>
    feed.items.some(
      (item) =>
        item.type === "resource" ||
        item.type === "question" ||
        (item.type === "organization_post" &&
          item.source?.kind === "campus_organization"),
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
  id: "search" | "resource" | "question";
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
    {
      id: "resource",
      label: "Compartir apunte",
      accessibilityLabel: "Compartir un apunte",
      accessibilityHint:
        "Abre Crear para elegir una materia habilitada. El servidor valida la participación y publica el recurso en privado.",
      navigation: "navigate",
      href: "/(tabs)/create",
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

export function homeComposeActions(
  hasCurrentSubject: boolean,
): HomeFirstValueAction[] {
  return homeFirstValueActions(hasCurrentSubject).filter(
    (action) => action.id !== "search",
  );
}
