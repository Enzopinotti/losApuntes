import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';

export class AuthRateLimitedError extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class AuthAbuseControlUnavailableError extends ServiceUnavailableException {
  constructor() {
    super({
      code: 'AUTH_ABUSE_CONTROL_UNAVAILABLE',
      message: 'Authentication admission control is temporarily unavailable',
    });
  }
}
