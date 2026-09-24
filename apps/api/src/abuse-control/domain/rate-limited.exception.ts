import { HttpException, HttpStatus } from '@nestjs/common';

export class RateLimitedException extends HttpException {
  constructor(retryAfterSeconds: number) {
    super(
      {
        code: 'RATE_LIMITED',
        message: 'Too many attempts',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
