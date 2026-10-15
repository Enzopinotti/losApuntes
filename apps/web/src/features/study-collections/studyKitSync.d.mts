import type { PortableStudyKit } from "../study/study-portable-kits.mjs";
export type StudyKitSyncProgress = {
  collectionId: string | null;
  total: number;
  linked: number;
  skipped: number;
};
export declare class StudyKitSyncError extends Error {
  readonly progress: StudyKitSyncProgress;
  readonly failure: unknown;
  constructor(message: string, progress: StudyKitSyncProgress, cause: unknown);
}
export declare function validateStudyKitSyncInput(
  kit: PortableStudyKit,
  subjectId: string,
): {
  operationKey: string;
  title: string;
  description: string;
  resourceIds: string[];
  subjectId: string;
};
export declare function syncStudyKitToCollection(
  input: { kit: PortableStudyKit; subjectId: string },
  api: {
    createCollection(
      input: { operationKey: string; title: string; description: string },
      signal?: AbortSignal,
    ): Promise<{ collection: { id: string } }>;
    readResource(id: string, signal?: AbortSignal): Promise<{
      resource: { id: string; academic: { subject: { id: string } } };
    }>;
    addResource(
      collectionId: string,
      resourceId: string,
      signal?: AbortSignal,
    ): Promise<unknown>;
  },
  signal?: AbortSignal,
  onProgress?: (progress: StudyKitSyncProgress) => void,
): Promise<StudyKitSyncProgress>;
