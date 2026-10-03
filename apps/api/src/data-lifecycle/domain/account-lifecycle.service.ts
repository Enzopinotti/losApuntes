import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AuthActionTokenService } from '../../auth/action-token/auth-action-token.service';
import { PasswordService } from '../../auth/password.service';
import { AuthSessionService } from '../../auth/session/auth-session.service';
import {
  credentialVersion,
  isAccountActive,
} from '../../users/user-security-state';
import { UsersService } from '../../users/users.service';
import {
  ACCOUNT_LIFECYCLE_STORE,
  type AccountLifecycleStore,
} from './account-lifecycle.store';
import {
  ACCOUNT_CLOSURE_MANAGER_BLOCKER_LIMIT,
  type AccountClosureManagerBlocker,
} from './account-lifecycle.types';

const CLEANUP_LEASE_MS = 2 * 60 * 1000;
const CLEANUP_RETRY_BASE_MS = 30 * 1000;
const CLEANUP_RETRY_MAX_MS = 30 * 60 * 1000;
const CLEANUP_MAX_ATTEMPTS = 6;

export type AccountClosurePreflight = {
  reauthentication: 'password' | 'unsupported';
  managementBlockers: AccountClosureManagerBlocker[];
  managementBlockersTruncated: boolean;
  managementBlockerLimit: number;
};

export type AccountClosureOutcome =
  | { kind: 'accepted'; cleanupJobId: string }
  | { kind: 'invalid_current_password' }
  | { kind: 'reauthentication_unavailable' }
  | { kind: 'management_blocked' }
  | { kind: 'conflict' };

export type AccountOffboardingCleanupResult = {
  examined: number;
  completed: number;
  retryScheduled: number;
  failed: number;
  terminalFailuresPresent: boolean;
};

@Injectable()
export class AccountLifecycleService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly sessions: AuthSessionService,
    private readonly actionTokens: AuthActionTokenService,
    @Inject(ACCOUNT_LIFECYCLE_STORE)
    private readonly store: AccountLifecycleStore,
  ) {}

  async preflight(userId: string): Promise<AccountClosurePreflight> {
    const [user, blockers] = await Promise.all([
      this.users.findById(userId),
      this.store.listManagementBlockers(
        userId,
        ACCOUNT_CLOSURE_MANAGER_BLOCKER_LIMIT,
      ),
    ]);

    return {
      reauthentication: user?.password_hash ? 'password' : 'unsupported',
      managementBlockers: blockers.items,
      managementBlockersTruncated: blockers.truncated,
      managementBlockerLimit: ACCOUNT_CLOSURE_MANAGER_BLOCKER_LIMIT,
    };
  }

  async close(
    userId: string,
    expectedCredentialVersion: number,
    currentPassword: string,
    now = new Date(),
  ): Promise<AccountClosureOutcome> {
    const user = await this.users.findById(userId);

    if (
      !user ||
      !isAccountActive(user) ||
      credentialVersion(user) !== expectedCredentialVersion
    ) {
      return { kind: 'conflict' };
    }

    if (!user.password_hash) {
      return { kind: 'reauthentication_unavailable' };
    }

    if (!(await this.passwords.verify(currentPassword, user.password_hash))) {
      return { kind: 'invalid_current_password' };
    }

    const cleanupJobId = randomUUID();
    const result = await this.store.closeAccount({
      userId,
      expectedCredentialVersion,
      now,
      auditId: randomUUID(),
      cleanupJobId,
    });

    if (result.status === 'manager_blocked') {
      return { kind: 'management_blocked' };
    }
    if (result.status === 'revision_conflict') {
      return { kind: 'conflict' };
    }

    return { kind: 'accepted', cleanupJobId: result.cleanupJobId };
  }

  async processPendingCleanup(
    limit: number,
    now = new Date(),
  ): Promise<AccountOffboardingCleanupResult> {
    const boundedLimit = Math.max(1, Math.min(limit, 20));
    const result: AccountOffboardingCleanupResult = {
      examined: 0,
      completed: 0,
      retryScheduled: 0,
      failed: 0,
      terminalFailuresPresent: false,
    };

    for (let index = 0; index < boundedLimit; index += 1) {
      const claimId = randomUUID();
      const job = await this.store.claimNextCleanup({
        now,
        claimId,
        leaseExpiresAt: new Date(now.getTime() + CLEANUP_LEASE_MS),
      });
      if (!job) break;

      result.examined += 1;

      try {
        await this.sessions.revokeAll(job.userId);
        await this.actionTokens.invalidateAll(
          job.userId,
          'email_verification',
          now,
        );
        await this.actionTokens.invalidateAll(
          job.userId,
          'password_recovery',
          now,
        );

        const completed = await this.store.completeCleanup({
          userId: job.userId,
          claimId,
          completedAt: now,
        });
        if (!completed) {
          throw new Error('Account cleanup claim changed concurrently');
        }

        result.completed += 1;
      } catch {
        const exhausted = job.attempts >= CLEANUP_MAX_ATTEMPTS;
        const retryMs = Math.min(
          CLEANUP_RETRY_BASE_MS * 2 ** Math.max(0, job.attempts - 1),
          CLEANUP_RETRY_MAX_MS,
        );
        const rescheduled = await this.store.rescheduleCleanup({
          userId: job.userId,
          claimId,
          state: exhausted ? 'failed' : 'pending',
          nextAttemptAt: new Date(now.getTime() + retryMs),
          failureCode: exhausted
            ? 'CLEANUP_RETRY_EXHAUSTED'
            : 'AUTHORITY_CLEANUP_FAILED',
        });
        if (!rescheduled) {
          throw new Error('Account cleanup claim changed concurrently');
        }

        if (exhausted) result.failed += 1;
        else result.retryScheduled += 1;
      }
    }

    result.terminalFailuresPresent = await this.store.hasFailedCleanup();
    return result;
  }
}
