export const PILOT_REPORT_STATUSES = [
  'pending',
  'resolved',
  'dismissed',
] as const;
export type PilotReportStatus = (typeof PILOT_REPORT_STATUSES)[number];

export const PILOT_MODERATION_ACTIONS = [
  'hide',
  'restore',
  'dismiss',
] as const;
export type PilotModerationAction =
  (typeof PILOT_MODERATION_ACTIONS)[number];

export type PilotReportKind = 'resource' | 'qa';
export type PilotModerationTargetKind = 'resource' | 'question' | 'answer';

export interface PilotModerationQueueItem {
  kind: PilotReportKind;
  reportId: string;
  targetKind: PilotModerationTargetKind;
  targetId: string;
  reason: string;
  details: string | null;
  status: PilotReportStatus;
  reporterUserId: string;
  createdAt: Date;
  reviewedAt?: Date;
  reviewedByUserId?: string;
  reviewReason?: string;
  action?: PilotModerationAction;
  target: {
    title: string;
    preview: string;
    moderationState: 'available' | 'hidden';
  };
}

export interface PilotModerationActionRecord {
  id: string;
  operatorUserId: string;
  reportKind: PilotReportKind;
  reportId: string;
  targetKind: PilotModerationTargetKind;
  targetId: string;
  action: PilotModerationAction;
  reason: string;
  createdAt: Date;
}

export interface PilotSubjectDensity {
  subjectId: string;
  currentParticipants: number;
  resources: number;
  openQuestions: number;
  contributionEvents: number;
}
