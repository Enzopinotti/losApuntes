import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { Observable } from 'rxjs';

@Injectable()
export class AuthNoStoreInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    reply.header('cache-control', 'no-store');
    return next.handle();
  }
}
