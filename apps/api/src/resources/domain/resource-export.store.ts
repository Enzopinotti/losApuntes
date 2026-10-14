import type {
  ResourceAccountExportRecord,
  ResourceAccountExportShareCursor,
  ResourceAccountExportShareGrantRecord,
  ResourceReportAccountExportRow,
} from './resource.types';

export const RESOURCE_EXPORT_STORE = Symbol('RESOURCE_EXPORT_STORE');

export interface ResourceExportStore {
  listAuthoredResourcesForExport(input: {
    authorUserId: string;
    limit: number;
    afterId?: string;
  }): Promise<{ items: ResourceAccountExportRecord[]; hasMore: boolean }>;

  listAuthoredResourceShareGrantsForExport(input: {
    authorUserId: string;
    limit: number;
    after?: ResourceAccountExportShareCursor;
  }): Promise<{
    items: ResourceAccountExportShareGrantRecord[];
    nextCursor: ResourceAccountExportShareCursor | null;
  }>;

  listSubmittedReportsForExport(input: {
    reporterUserId: string;
    limit: number;
    afterId?: string;
  }): Promise<{ items: ResourceReportAccountExportRow[]; hasMore: boolean }>;
}
