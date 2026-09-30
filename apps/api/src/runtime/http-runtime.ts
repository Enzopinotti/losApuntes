import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { ValidationError } from 'class-validator';
import { randomUUID } from 'node:crypto';
import {
  type FastifyReply,
  type FastifyRequest,
  LogController,
} from 'fastify';

import { ApiAdmissionBudget } from './api-admission';
import { ApiExceptionFilter } from './api-exception.filter';

const HTTP_REQUEST_TIMEOUT_MS = 120_000;
const HTTP_BODY_LIMIT_BYTES = 1024 * 1024;
const DEFAULT_API_MAX_IN_FLIGHT_REQUESTS = 256;
const DEFAULT_API_ADMISSION_RETRY_AFTER_SECONDS = 1;

const LOGGER_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.secret',
  '*.token',
  '*.apiKey',
  '*.accessToken',
  '*.refreshToken',
  '*.sessionToken',
  '*.credentials',
] as const;

export interface HttpAdapterOptions {
  logger?: boolean;
  trustProxy?: string[];
}

type AuthAwareRequest = FastifyRequest & {
  user?: unknown;
};

function validationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...validationMessages(error.children ?? []),
  ]);
}

function validationException(errors: ValidationError[]): BadRequestException {
  const passwordInvalid = errors.some(
    (error) =>
      error.property === 'password' || error.property === 'newPassword',
  );

  return new BadRequestException({
    code: passwordInvalid ? 'INVALID_PASSWORD' : 'BAD_REQUEST',
    message: validationMessages(errors),
  });
}

function cacheControlFor(request: FastifyRequest): string {
  const authenticated = (request as AuthAwareRequest).user !== undefined;
  return authenticated ? 'private, no-store' : 'no-store';
}

export function requestCompletionLogFields(
  request: FastifyRequest,
  reply: FastifyReply,
): Record<string, string | number | undefined> {
  return {
    event: 'http.request.completed',
    requestId: request.id,
    correlationId: request.id,
    method: request.method,
    route: request.routeOptions.url,
    statusCode: reply.statusCode,
    durationMs: Math.round(reply.elapsedTime * 100) / 100,
  };
}

export function createHttpAdapter(
  options: HttpAdapterOptions = {},
): FastifyAdapter {
  const loggerEnabled = options.logger ?? true;

  return new FastifyAdapter({
    logger: loggerEnabled
      ? {
          redact: {
            paths: [...LOGGER_REDACT_PATHS],
            censor: '[REDACTED]',
          },
        }
      : false,
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    requestTimeout: HTTP_REQUEST_TIMEOUT_MS,
    bodyLimit: HTTP_BODY_LIMIT_BYTES,
    onProtoPoisoning: 'error',
    onConstructorPoisoning: 'error',
    trustProxy:
      options.trustProxy && options.trustProxy.length > 0
        ? options.trustProxy
        : false,
  });
}

export function configureHttpRuntime(
  app: NestFastifyApplication,
  config: ConfigService,
): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: {
        target: false,
        value: false,
      },
      exceptionFactory: validationException,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);

  const webOrigin = config.get<string>('WEB_ORIGIN');
  if (webOrigin) {
    app.enableCors({
      origin: webOrigin,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
  }

  const maximumInFlight =
    config.get<number>('API_MAX_IN_FLIGHT_REQUESTS') ??
    DEFAULT_API_MAX_IN_FLIGHT_REQUESTS;
  const retryAfterSeconds =
    config.get<number>('API_ADMISSION_RETRY_AFTER_SECONDS') ??
    DEFAULT_API_ADMISSION_RETRY_AFTER_SECONDS;
  const admission = new ApiAdmissionBudget(maximumInFlight);

  const adapter = app.getHttpAdapter() as FastifyAdapter;
  const server = adapter.getInstance();

  server.addHook('onRequest', (request, reply, done) => {
    const decision = admission.tryAcquire(request.id);

    if (!decision.admitted) {
      request.log.warn(
        {
          event: 'http.request.capacity_rejected',
          requestId: request.id,
          correlationId: request.id,
          statusCode: 429,
          activeRequests: decision.active,
          maximumInFlight: decision.maximum,
        },
        'HTTP request rejected by API capacity budget',
      );

      reply.header('retry-after', String(retryAfterSeconds));
      reply.header('cache-control', 'no-store');
      reply.status(429).send({
        statusCode: 429,
        code: 'API_CAPACITY_LIMITED',
        message: 'API capacity is temporarily limited',
        retryAfterSeconds,
        requestId: request.id,
      });
      return;
    }

    request.raw.once('close', () => {
      admission.release(request.id);
    });

    done();
  });

  server.addHook('onSend', (request, reply, payload, done) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', cacheControlFor(request));
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header(
      'permissions-policy',
      'camera=(), geolocation=(), microphone=()',
    );
    reply.header('x-permitted-cross-domain-policies', 'none');

    done(null, payload);
  });

  server.addHook('onResponse', (request, reply, done) => {
    admission.release(request.id);
    request.log.info(
      requestCompletionLogFields(request, reply),
      'HTTP request completed',
    );
    done();
  });
}
