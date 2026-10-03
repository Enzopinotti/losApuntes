import type { OrganizationManagerRole } from '../../organizations/domain/organization.types';

export const ACCOUNT_CLOSURE_MANAGER_BLOCKER_LIMIT = 20;

export type AccountClosureManagerBlocker = {
  organizationId: string;
  role: OrganizationManagerRole;
};

export type AccountClosureStoreResult =
  | { status: 'closed'; cleanupJobId: string }
  | { status: 'manager_blocked' }
  | { status: 'revision_conflict' };

export type AccountOffboardingJobState =
  'pending' | 'processing' | 'completed' | 'failed';

export type AccountOffboardingJobRecord = {
  id: string;
  userId: string;
  state: AccountOffboardingJobState;
  attempts: number;
  nextAttemptAt: Date;
  claimId: string | null;
  leaseExpiresAt: Date | null;
  failureCode: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
