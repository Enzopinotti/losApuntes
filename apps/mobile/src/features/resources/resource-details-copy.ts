import type {
  ResourceView,
  ResourceFileMimeType,
  ResourceVisibility,
} from "@losapuntes/contracts";

export type ResourceAuthorAction = {
  profileId: string;
  accessibilityLabel: string;
  accessibilityHint: string;
};

export function resourceAuthorAction(
  author: ResourceView["author"],
): ResourceAuthorAction | null {
  const profileId = author?.profileId;
  if (!profileId || profileId.trim() !== profileId) return null;

  const displayName = author.displayName.trim() || "esta persona";
  return {
    profileId,
    accessibilityLabel: `Ver perfil de ${displayName}`,
    accessibilityHint:
      "Abre el perfil público y vuelve a comprobar los permisos actuales.",
  };
}

const fileTypeLabels: Record<ResourceFileMimeType, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

const visibilityLabels: Record<ResourceVisibility, string> = {
  private: "Privado",
  shared: "Compartido",
  public: "Público",
};

export type ResourceRowAccessibilityDetails = {
  title: string;
  subjectName: string;
  authorName: string | null;
  mimeType: string;
  byteSize: number;
};

export function resourceFileTypeLabel(mimeType: string): string {
  const normalized = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return (
    fileTypeLabels[normalized as ResourceFileMimeType] ??
    "Formato no identificado"
  );
}

export function resourceFileSizeLabel(byteSize: number): string {
  if (byteSize < 1024) return byteSize === 1 ? "1 byte" : `${byteSize} bytes`;
  if (byteSize < 1024 * 1024) {
    return `${Math.round(byteSize / 1024)} KB`;
  }
  return `${(byteSize / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function resourceRowAccessibilityLabel(
  resource: ResourceRowAccessibilityDetails,
  action: "Abrir recurso" | "Abrir recurso guardado" | "Administrar mi apunte",
): string {
  return `${action}: ${resource.title}. Materia: ${resource.subjectName}. Autor: ${resource.authorName ?? "no disponible"}. Formato: ${resourceFileTypeLabel(resource.mimeType)}. Tamaño: ${resourceFileSizeLabel(resource.byteSize)}.`;
}

export function resourceVisibilityLabel(
  visibility: ResourceVisibility,
): string {
  return visibilityLabels[visibility];
}
