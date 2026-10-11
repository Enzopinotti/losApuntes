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

export function resourceFileSizeLabel(byteSize: number): string {
  if (byteSize < 1024) return byteSize === 1 ? "1 byte" : `${byteSize} bytes`;
  if (byteSize < 1024 * 1024) {
    return `${Math.round(byteSize / 1024)} KB`;
  }
  return `${(byteSize / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function resourceVisibilityLabel(
  visibility: ResourceVisibility,
): string {
  return visibilityLabels[visibility];
}
