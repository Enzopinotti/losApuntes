export interface CollectionHealthReport {
  collectionId: string;
  revision: number;
  total: number;
  inspected: number;
  missingIds: string[];
  accessible: number;
  pages: number;
}
export interface CollectionHealthProgress {
  collectionId: string;
  revision: number | null;
  total: number | null;
  inspected: number;
  missingIds: string[];
  pages: number;
}
export interface CollectionRepairProgress {
  collectionId: string;
  revision: number;
  total: number;
  processed: number;
  removed: number;
  restored: number;
}
export declare class CollectionRecoveryError extends Error {
  readonly code: string;
  readonly progress: CollectionHealthProgress | CollectionRepairProgress;
  readonly failure: unknown;
  constructor(code: string, progress: CollectionHealthProgress | CollectionRepairProgress, cause: unknown);
}
export declare function inspectCollectionHealth(
  collectionId: string,
  api: {
    get(id: string, signal?: AbortSignal): Promise<{ collection: { id: string; revision: number; resourceCount: number } }>;
    resources(id: string, cursor?: string, signal?: AbortSignal): Promise<{
      items: { resourceId: string; resource: { id: string } | null }[];
      nextCursor: string | null;
      revision: number;
    }>;
  },
  signal?: AbortSignal,
  onProgress?: (progress: CollectionHealthProgress) => void,
): Promise<CollectionHealthReport>;
export declare function repairMissingReferences(
  report: CollectionHealthReport,
  api: {
    get(id: string, signal?: AbortSignal): Promise<{ collection: { id: string; revision: number; resourceCount: number } }>;
    readResource(id: string, signal?: AbortSignal): Promise<{ resource: { id: string } }>;
    remove(
      id: string, resourceId: string, signal?: AbortSignal,
      expectedRevision?: number,
    ): Promise<{ collection: { id: string; revision: number } }>;
  },
  signal?: AbortSignal,
  onProgress?: (progress: CollectionRepairProgress) => void,
): Promise<CollectionRepairProgress>;
