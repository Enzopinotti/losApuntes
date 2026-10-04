import { File, UploadType } from "expo-file-system";

import type {
  PickedResourceFile,
  ResourceUploadIntent,
} from "./resource-types";
import type { UploadResourceBytes } from "./resource-upload-controller";
import { ResourceUploadError } from "./resource-upload-controller";
import { isPermittedUploadIntent } from "./resource-upload-policy";

export const uploadResourceBytes: UploadResourceBytes = async (
  file: PickedResourceFile,
  intent: ResourceUploadIntent,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
) => {
  if (!isPermittedUploadIntent(intent.upload)) {
    throw new ResourceUploadError("STORAGE_UPLOAD_INTENT_INVALID");
  }

  const upload = new File(file.uri).createUploadTask(intent.upload.url, {
    httpMethod: "PUT",
    uploadType: UploadType.BINARY_CONTENT,
    headers: intent.upload.headers,
    mimeType: file.mimeType,
    sessionType: "foreground",
    ...(signal ? { signal } : {}),
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes <= 0) return;
      onProgress(
        Math.max(0, Math.min(100, Math.round((bytesSent / totalBytes) * 100))),
      );
    },
  });

  try {
    const response = await upload.uploadAsync();
    if (response.status < 200 || response.status >= 300) {
      throw new ResourceUploadError("STORAGE_UPLOAD_REJECTED");
    }
    onProgress(100);
  } catch {
    if (signal?.aborted) {
      throw new ResourceUploadError("UPLOAD_CANCELLED");
    }
    throw new ResourceUploadError("STORAGE_UPLOAD_FAILED");
  } finally {
    upload.release();
  }
};
