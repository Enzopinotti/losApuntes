import type { ImagePickerAsset } from "expo-image-picker";

export type CameraResourceFile = Readonly<{
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}>;

function safeCameraFilename(fileName: string | null | undefined): string {
  const candidate =
    fileName
      ?.replace(/[\p{Cc}\p{Cf}]/gu, "")
      .split(/[\\/]/u)
      .at(-1)
      ?.trim() ?? "";
  return candidate.length > 0 && candidate.length <= 180
    ? candidate
    : "captura.jpg";
}

export function cameraAssetResourceFile(
  asset: Pick<ImagePickerAsset, "uri" | "fileName" | "fileSize" | "mimeType">,
  actualFileSize: number,
): CameraResourceFile | null {
  if (
    typeof asset.uri !== "string" ||
    asset.uri.length === 0 ||
    asset.uri.trim() !== asset.uri
  ) {
    return null;
  }

  const pickerFileSize = asset.fileSize;
  const validPickerSize =
    typeof pickerFileSize === "number" &&
    Number.isSafeInteger(pickerFileSize) &&
    pickerFileSize > 0
      ? pickerFileSize
      : null;
  const validActualSize =
    Number.isSafeInteger(actualFileSize) && actualFileSize > 0
      ? actualFileSize
      : null;
  const size = validPickerSize ?? validActualSize;
  if (size === null) return null;

  return {
    uri: asset.uri,
    name: safeCameraFilename(asset.fileName),
    size,
    mimeType: asset.mimeType?.trim().toLowerCase() || "image/jpeg",
  };
}
