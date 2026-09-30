import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates, type Connection } from 'mongoose';

import { OBJECT_STORAGE, type ObjectStorage } from '../files/storage/object-storage';

const READINESS_TIMEOUT_MS = 1_500;
const STORAGE_PROBE_KEY = '__health__/probe';

export type HealthStatus = 'ready' | 'degraded' | 'not_ready';

export type HealthCheckResult = {
  name: 'mongo' | 'storage';
  status: 'ok' | 'failed';
  required: boolean;
};

export type ReadinessResult = {
  status: HealthStatus;
  service: 'api';
};

export type OperatorHealthResult = ReadinessResult & {
  checks: HealthCheckResult[];
  checkedAt: string;
};

async function withTimeout(
  operation: Promise<unknown>,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Readiness check timed out')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  liveness() {
    return {
      status: 'ok' as const,
      service: 'api' as const,
    };
  }

  async readiness(timeoutMs = READINESS_TIMEOUT_MS): Promise<ReadinessResult> {
    const diagnostics = await this.diagnostics(timeoutMs);

    return {
      status: diagnostics.status,
      service: diagnostics.service,
    };
  }

  async diagnostics(
    timeoutMs = READINESS_TIMEOUT_MS,
  ): Promise<OperatorHealthResult> {
    const [mongo, storage] = await Promise.all([
      this.mongoCheck(timeoutMs),
      this.storageCheck(timeoutMs),
    ]);
    const checks = [mongo, storage];

    return {
      status:
        mongo.status === 'failed'
          ? 'not_ready'
          : storage.status === 'failed'
            ? 'degraded'
            : 'ready',
      service: 'api',
      checks,
      checkedAt: new Date().toISOString(),
    };
  }

  private async mongoCheck(timeoutMs: number): Promise<HealthCheckResult> {
    if (
      this.connection.readyState !== ConnectionStates.connected ||
      !this.connection.db
    ) {
      return {
        name: 'mongo',
        status: 'failed',
        required: true,
      };
    }

    try {
      await withTimeout(this.connection.db.admin().ping(), timeoutMs);

      return {
        name: 'mongo',
        status: 'ok',
        required: true,
      };
    } catch {
      return {
        name: 'mongo',
        status: 'failed',
        required: true,
      };
    }
  }

  private async storageCheck(timeoutMs: number): Promise<HealthCheckResult> {
    try {
      await this.storage.headObject(STORAGE_PROBE_KEY, timeoutMs);

      return {
        name: 'storage',
        status: 'ok',
        required: false,
      };
    } catch {
      return {
        name: 'storage',
        status: 'failed',
        required: false,
      };
    }
  }
}
