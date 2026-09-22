import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates, type Connection } from 'mongoose';

const MONGO_READINESS_TIMEOUT_MS = 1_500;

export type HealthCheckResult = {
  name: 'mongo';
  status: 'ok' | 'failed';
  required: true;
};

export type ReadinessResult = {
  status: 'ready' | 'not_ready';
  service: 'api';
  checks: HealthCheckResult[];
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
          () => reject(new Error('Mongo readiness check timed out')),
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
  constructor(@InjectConnection() private readonly connection: Connection) {}

  liveness() {
    return {
      status: 'ok' as const,
      service: 'api' as const,
    };
  }

  async readiness(
    timeoutMs = MONGO_READINESS_TIMEOUT_MS,
  ): Promise<ReadinessResult> {
    const check = await this.mongoCheck(timeoutMs);

    return {
      status: check.status === 'ok' ? 'ready' : 'not_ready',
      service: 'api',
      checks: [check],
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
}
