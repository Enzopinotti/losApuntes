import type { ResourceAccountExportRecord } from './resource.types';

export const RESOURCE_EXPORT_STORE = Symbol('RESOURCE_EXPORT_STORE');

export interface ResourceExportStore {
  listAuthoredResourcesForExport(input: {
    authorUserId: string;
    limit: number;
    afterId?: string;
  }): Promise<{ items: ResourceAccountExportRecord[]; hasMore: boolean }>;
}
