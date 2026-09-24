import type {
  PilotModerationAction,
  PilotModerationQueueItem,
  PilotReportKind,
  PilotReportStatus,
  PilotSubjectDensity,
} from './pilot.types';

export const PILOT_STORE = Symbol('PILOT_STORE');

export class PilotReportNotFoundError extends Error {
  constructor() {
    super('Pilot report was not found');
    this.name = 'PilotReportNotFoundError';
  }
}

export class PilotReportAlreadyReviewedError extends Error {
  constructor() {
    super('Pilot report has already been reviewed');
    this.name = 'PilotReportAlreadyReviewedError';
  }
}

export class PilotModerationTargetNotFoundError extends Error {
  constructor() {
    super('Pilot moderation target was not found');
    this.name = 'PilotModerationTargetNotFoundError';
  }
}

export interface PilotMetricsSnapshot {
  window: {
    from: Date;
    to: Date;
    days: number;
  };
  onboarding: {
    accountsCreated: number;
    profilesCompleted: number;
    dropOff: number;
  };
  search: {
    searches: number;
    noResultSearches: number;
  };
  activity: {
    activeUsers: number;
    returningUsers: number;
  };
  audience: {
    activeStudents: {
      activeUsers: number;
      returningUsers: number;
    };
    alumni: {
      activeUsers: number;
      returningUsers: number;
    };
    community: {
      activeUsers: number;
      returningUsers: number;
    };
  };
  contributions: {
    events: number;
    contributors: number;
  };
  moderation: {
    pending: number;
    reviewedInWindow: number;
    oldestPendingAt: Date | null;
  };
  subjects: PilotSubjectDensity[];
  subjectsTruncated: boolean;
}

export interface PilotStore {
  listModeration(input: {
    status: PilotReportStatus;
    limit: number;
  }): Promise<PilotModerationQueueItem[]>;

  reviewModeration(input: {
    kind: PilotReportKind;
    reportId: string;
    operatorUserId: string;
    action: PilotModerationAction;
    reason: string;
    now: Date;
  }): Promise<PilotModerationQueueItem>;

  metrics(input: {
    from: Date;
    to: Date;
    previousFrom: Date;
    previousTo: Date;
    days: number;
  }): Promise<PilotMetricsSnapshot>;
}
