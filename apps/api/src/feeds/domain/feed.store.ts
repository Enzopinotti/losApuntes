import type {
  FeedFeedbackRecord,
  FeedFeedbackExportCursor,
  FeedFeedbackExportRecord,
  FeedFeedbackSignal,
  FeedPreferencesExportRecord,
  FeedPreferencesRecord,
  FeedTargetType,
} from './feed.types';

export const FEED_STORE = Symbol('FEED_STORE');

export type UpdateFeedPreferencesRecord = Partial<
  Pick<
    FeedPreferencesRecord,
    | 'useAcademic'
    | 'useSocial'
    | 'useInterests'
    | 'mutedSubjectIds'
    | 'mutedProfileIds'
    | 'prioritizedSubjectIds'
  >
>;

export interface FeedStore {
  getOrCreatePreferences(userId: string): Promise<FeedPreferencesRecord>;
  findPreferencesForExport(
    userId: string,
  ): Promise<FeedPreferencesExportRecord | null>;
  updatePreferences(
    userId: string,
    expectedRevision: number,
    patch: UpdateFeedPreferencesRecord,
  ): Promise<FeedPreferencesRecord | null>;

  listFeedback(
    userId: string,
    targets: Array<{ targetType: FeedTargetType; targetId: string }>,
  ): Promise<FeedFeedbackRecord[]>;
  listFeedbackForExport(
    userId: string,
    after: FeedFeedbackExportCursor | null,
    limit: number,
  ): Promise<FeedFeedbackExportRecord[]>;

  setFeedback(input: {
    userId: string;
    targetType: FeedTargetType;
    targetId: string;
    signal: FeedFeedbackSignal;
  }): Promise<{
    feedback: FeedFeedbackRecord;
    changed: boolean;
    revision: number;
  }>;

  clearFeedback(input: {
    userId: string;
    targetType: FeedTargetType;
    targetId: string;
  }): Promise<{ changed: boolean; revision: number }>;
}
