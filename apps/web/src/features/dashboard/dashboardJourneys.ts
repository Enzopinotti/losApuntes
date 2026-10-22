export type DashboardJourneyId =
  "study" | "contribute" | "community" | "account";

export type DashboardAction = Readonly<{
  id: string;
  label: string;
  description: string;
  href: string;
}>;

export type DashboardJourney = Readonly<{
  id: DashboardJourneyId;
  title: string;
  description: string;
  actions: readonly DashboardAction[];
}>;

/**
 * Small, finite, user-initiated journeys backed by routes already in main.
 * Do not link to gated Study Progress or pending API-only PRs.
 */
export const dashboardJourneys: readonly DashboardJourney[] = [
  {
    id: "study",
    title: "Estudiar",
    description: "Elegí una materia y avanzá con una sesión concreta.",
    actions: [
      {
        id: "study-workbench",
        label: "Mi espacio de estudio",
        description: "Organizá recursos y preguntas alrededor de una materia.",
        href: "/study",
      },
      {
        id: "study-practice",
        label: "Practicar ahora",
        description: "Prepará una práctica vinculada a tu contexto académico.",
        href: "/study/practice",
      },
      {
        id: "portable-kits",
        label: "Mis colecciones portátiles",
        description:
          "Prepará kits locales y revisá su alcance antes de compartirlos.",
        href: "/study/kits",
      },
    ],
  },
  {
    id: "contribute",
    title: "Buscar y aportar",
    description: "Encontrá material útil o ayudá con una pregunta.",
    actions: [
      {
        id: "resources",
        label: "Encontrar apuntes",
        description: "Explorá recursos y guardá los que realmente necesitás.",
        href: "/resources",
      },
      {
        id: "questions",
        label: "Preguntas académicas",
        description: "Consultá dudas y compartí respuestas en contexto.",
        href: "/questions",
      },
      {
        id: "search",
        label: "Explorar materias",
        description:
          "Buscá contenidos, materias y personas desde un solo lugar.",
        href: "/search",
      },
    ],
  },
  {
    id: "community",
    title: "Mi comunidad",
    description: "Participá con intención y mantené el control de tu red.",
    actions: [
      {
        id: "feeds",
        label: "Feeds académicos",
        description: "Revisá una tanda acotada de contenido relevante.",
        href: "/feeds",
      },
      {
        id: "network",
        label: "Mi red",
        description: "Gestioná seguidores, conexiones y solicitudes.",
        href: "/network",
      },
      {
        id: "notifications",
        label: "Mis notificaciones",
        description: "Consultá novedades sin perder el hilo de tu estudio.",
        href: "/notifications",
      },
    ],
  },
  {
    id: "account",
    title: "Mi trayectoria y cuenta",
    description: "Mantené tus datos académicos, perfil y acceso actualizados.",
    actions: [
      {
        id: "profile",
        label: "Mi perfil",
        description: "Revisá la información que elegís mostrar.",
        href: "/profile",
      },
      {
        id: "academic-lifecycle",
        label: "Trayectoria académica",
        description: "Actualizá tus roles y afiliaciones universitarias.",
        href: "/academic/lifecycle",
      },
      {
        id: "security",
        label: "Seguridad y sesiones",
        description: "Revisá los accesos y la protección de tu cuenta.",
        href: "/settings/security",
      },
    ],
  },
] as const;

export function dashboardJourneyById(id: DashboardJourneyId): DashboardJourney {
  const journey = dashboardJourneys.find((candidate) => candidate.id === id);
  if (!journey) throw new Error("Unknown dashboard journey");
  return journey;
}
