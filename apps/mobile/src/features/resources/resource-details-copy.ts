import type {
  ResourceFileMimeType,
  ResourceVisibility,
} from "@losapuntes/contracts";

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

export function resourceFileTypeLabel(mimeType: string): string {
  const normalized = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return (
    fileTypeLabels[normalized as ResourceFileMimeType] ??
    "Formato no identificado"
  );
}

export function resourceVisibilityLabel(
  visibility: ResourceVisibility,
): string {
  return visibilityLabels[visibility];
}
