import type { FileAssetRecord } from '../../files/domain/file.types';
import type {
  ResourceRecord,
  ResourceReportRecord,
  ResourceReportReason,
  ResourceSearchCursor,
  ResourceVisibility,
} from './resource.types';

export const RESOURCE_STORE = Symbol('RESOURCE_STORE');

export class ResourceAssetUnavailableError extends Error {
  constructor() {
    super('Resource asset is unavailable');
    this.name = 'ResourceAssetUnavailableError';
  }
}

export type CreateResourceRecord = Omit<
  ResourceRecord,
  'createdAt' | 'updatedAt'
>;

export type UpdateResourceRecord = Partial<
  Pick<
    ResourceRecord,
    'title' | 'description' | 'tags' | 'searchText' | 'visibility'
  >
>;

export interface ResourceStore {
  createClaimingAsset(input: {
    resource: CreateResourceRecord;
    actorUserId: string;
    now: Date;
  }): Promise<{ resource: ResourceRecord; asset: FileAssetRecord }>;
  findById(id: string): Promise<ResourceRecord | null>;
  findManyByIds(ids: string[]): Promise<ResourceRecord[]>;
  updateOwned(
    id: string,
    authorUserId: string,
    expectedRevision: number,
    patch: UpdateResourceRecord,
  ): Promise<ResourceRecord | null>;
  hasShare(resourceId: string, userId: string): Promise<boolean>;
  upsertShare(resourceId: string, userId: string): Promise<void>;
  removeShare(resourceId: string, userId: string): Promise<void>;
  upsertSave(resourceId: string, userId: string): Promise<void>;
  removeSave(resourceId: string, userId: string): Promise<void>;
  listSavedResourceIds(userId: string, limit: number): Promise<string[]>;
  searchAuthorized(input: {
    viewerUserId?: string;
    q?: string;
    subjectId?: string;
    visibility?: ResourceVisibility;
    limit: number;
    after?: ResourceSearchCursor;
  }): Promise<{ items: ResourceRecord[]; hasMore: boolean }>;
  upsertPendingReport(input: {
    id: string;
    resourceId: string;
    reporterUserId: string;
    reason: ResourceReportReason;
    details: string | null;
  }): Promise<ResourceReportRecord>;
}
