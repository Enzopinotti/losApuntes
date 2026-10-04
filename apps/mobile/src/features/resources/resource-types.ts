import type {
  FileUploadIntentResponse,
  ResourceCreateInput,
  ResourceFileMimeType,
  ResourceView,
} from "@losapuntes/contracts";

export const RESOURCE_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const satisfies readonly ResourceFileMimeType[];

export const RESOURCE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export type ResourceUploadMimeType = ResourceFileMimeType;

export type PickedResourceFile = {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  operationKey: string;
};

export type ResourceUploadIntent = FileUploadIntentResponse;

export type CreateMobileResourceInput = Omit<
  ResourceCreateInput,
  "visibility"
> & { visibility: "private" };

export type CreatedMobileResource = { resource: ResourceView };

export type ResourceUploadStage = "intent" | "transfer" | "finalize" | "create";

export type ResourceUploadProgress = {
  stage: ResourceUploadStage;
  percent: number | null;
};
