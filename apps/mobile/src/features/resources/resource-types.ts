import {
  RESOURCE_FILE_MIME_TYPES,
  type FileUploadIntentResponse,
  type ResourceCreateInput,
  type ResourceFileMimeType,
  type ResourceView,
} from "@losapuntes/contracts";

export const RESOURCE_UPLOAD_MIME_TYPES = RESOURCE_FILE_MIME_TYPES;

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
