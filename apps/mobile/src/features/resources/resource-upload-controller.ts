import { ApiRequestError } from "@/services/api/client";

import type {
  CreateMobileResourceInput,
  CreatedMobileResource,
  PickedResourceFile,
  ResourceUploadIntent,
  ResourceUploadProgress,
} from "./resource-types";
import {
  RESOURCE_UPLOAD_MAX_BYTES,
  RESOURCE_UPLOAD_MIME_TYPES,
} from "./resource-types";

export interface MobileResourceUploadApi {
  createUploadIntent(
    input: {
      operationKey: string;
      filename: string;
      mimeType: string;
      byteSize: number;
    },
    signal?: AbortSignal,
  ): Promise<ResourceUploadIntent>;
  finalize(fileId: string, signal?: AbortSignal): Promise<void>;
  create(
    input: CreateMobileResourceInput,
    signal?: AbortSignal,
  ): Promise<CreatedMobileResource>;
}

export type UploadResourceBytes = (
  file: PickedResourceFile,
  intent: ResourceUploadIntent,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
) => Promise<void>;

export class ResourceUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ResourceUploadError";
  }
}

type OperationState = {
  operationKey: string;
  fileFingerprint: string;
  intent: ResourceUploadIntent | null;
  bytesUploaded: boolean;
  finalized: boolean;
  resourceCreateUncertain: boolean;
};

export function resourceFileValidationError(
  file: PickedResourceFile,
): string | null {
  if (
    !file.name.trim() ||
    !file.uri.trim() ||
    !Number.isSafeInteger(file.size) ||
    file.size <= 0
  ) {
    return "El archivo seleccionado no está disponible.";
  }
  if (
    !RESOURCE_UPLOAD_MIME_TYPES.some((mimeType) => mimeType === file.mimeType)
  ) {
    return "Usá PDF, JPG, PNG o WebP.";
  }
  if (file.size > RESOURCE_UPLOAD_MAX_BYTES) {
    return "El archivo supera el máximo de 50 MiB.";
  }
  return null;
}

export function parseResourceTags(raw: string): string[] {
  const tags = raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique = tags.filter((tag) => {
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length > 12 || unique.some((tag) => tag.length > 40)) {
    throw new ResourceUploadError("RESOURCE_TAGS_INVALID");
  }
  return unique;
}

function fileFingerprint(file: PickedResourceFile): string {
  return JSON.stringify([file.name, file.mimeType, file.size]);
}

function isUncertainCreateFailure(
  error: unknown,
  signal?: AbortSignal,
): boolean {
  if (signal?.aborted) return true;
  if (!(error instanceof ApiRequestError)) return true;
  if (
    error.kind === "offline" ||
    error.kind === "timeout" ||
    error.kind === "server_unavailable"
  ) {
    return true;
  }
  return error.code === "RESOURCE_ASSET_UNAVAILABLE";
}

export class ResourceUploadController {
  private operation: OperationState | null = null;
  private inFlight = false;

  constructor(
    private readonly api: MobileResourceUploadApi,
    private readonly uploadBytes: UploadResourceBytes,
  ) {}

  reset(): void {
    this.operation = null;
  }

  async publish(
    file: PickedResourceFile,
    input: Omit<CreateMobileResourceInput, "assetId" | "visibility">,
    onProgress: (progress: ResourceUploadProgress) => void,
    signal?: AbortSignal,
  ): Promise<CreatedMobileResource> {
    const validationError = resourceFileValidationError(file);
    if (validationError) throw new ResourceUploadError("RESOURCE_FILE_INVALID");
    if (this.inFlight) throw new ResourceUploadError("UPLOAD_ALREADY_ACTIVE");
    if (!file.operationKey) {
      throw new ResourceUploadError("UPLOAD_OPERATION_KEY_REQUIRED");
    }

    const fingerprint = fileFingerprint(file);
    if (this.operation?.operationKey === file.operationKey) {
      if (this.operation.fileFingerprint !== fingerprint) {
        throw new ResourceUploadError("UPLOAD_OPERATION_FILE_MISMATCH");
      }
    } else {
      this.operation = {
        operationKey: file.operationKey,
        fileFingerprint: fingerprint,
        intent: null,
        bytesUploaded: false,
        finalized: false,
        resourceCreateUncertain: false,
      };
    }

    const operation = this.operation;
    if (!operation) throw new ResourceUploadError("UPLOAD_OPERATION_MISSING");
    if (operation.resourceCreateUncertain) {
      throw new ResourceUploadError("RESOURCE_CREATE_OUTCOME_UNCERTAIN");
    }

    this.inFlight = true;
    try {
      if (!operation.intent) {
        onProgress({ stage: "intent", percent: null });
        operation.intent = await this.api.createUploadIntent(
          {
            operationKey: file.operationKey,
            filename: file.name,
            mimeType: file.mimeType,
            byteSize: file.size,
          },
          signal,
        );
      }

      if (!operation.bytesUploaded) {
        onProgress({ stage: "transfer", percent: 0 });
        await this.uploadBytes(
          file,
          operation.intent,
          (percent) => onProgress({ stage: "transfer", percent }),
          signal,
        );
        operation.bytesUploaded = true;
      }

      if (!operation.finalized) {
        onProgress({ stage: "finalize", percent: null });
        await this.api.finalize(operation.intent.file.id, signal);
        operation.finalized = true;
      }

      onProgress({ stage: "create", percent: null });
      try {
        const created = await this.api.create(
          {
            ...input,
            assetId: operation.intent.file.id,
            visibility: "private",
          },
          signal,
        );
        this.operation = null;
        return created;
      } catch (error) {
        if (isUncertainCreateFailure(error, signal)) {
          operation.resourceCreateUncertain = true;
        }
        throw error;
      }
    } finally {
      this.inFlight = false;
    }
  }
}
