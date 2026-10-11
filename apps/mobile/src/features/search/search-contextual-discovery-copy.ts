export const ACADEMIC_CONTEXT_HOME_ROUTE = "/(tabs)/home" as const;

export type ContextualDiscoveryEmptyCopy = {
  message: string;
  configureContextLabel: string | null;
};

export function contextualDiscoveryEmptyCopy(
  noContext: boolean,
): ContextualDiscoveryEmptyCopy {
  if (noContext) {
    return {
      message:
        "Todavía no hay una materia actual validada. Configurá tu contexto académico desde Inicio para descubrir recursos relevantes.",
      configureContextLabel: "Configurar contexto académico",
    };
  }

  return {
    message: "No encontramos recursos visibles para tus materias actuales.",
    configureContextLabel: null,
  };
}
