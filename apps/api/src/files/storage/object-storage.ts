export interface ObjectStorageUploadIntent {
  url: string;
  method: 'PUT';
  headers: Readonly<Record<string, string>>;
  expiresAt: Date;
}

export interface ObjectStorageHead {
  byteSize: number;
  contentType: string | null;
  etag: string | null;
}

export interface ObjectStorageDownloadIntent {
  url: string;
  expiresAt: Date;
}

export interface ObjectStorage {
  readonly providerId: string;
  createUploadIntent(input: {
    objectKey: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<ObjectStorageUploadIntent>;
  headObject(objectKey: string): Promise<ObjectStorageHead | null>;
  readPrefix(objectKey: string, maximumBytes: number): Promise<Uint8Array>;
  createDownloadIntent(input: {
    objectKey: string;
    filename: string;
    contentType: string;
    disposition: 'inline' | 'attachment';
    expiresInSeconds: number;
  }): Promise<ObjectStorageDownloadIntent>;
  deleteObject(objectKey: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
