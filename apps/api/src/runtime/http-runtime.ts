import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { ValidationError } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { LogController } from 'fastify';

import { ApiExceptionFilter } from './api-exception.filter';

const HTTP_REQUEST_TIMEOUT_MS = 120_000;
const HTTP_BODY_LIMIT_BYTES = 1024 * 1024;

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
}

function validationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...validationMessages(error.children ?? []),
  ]);
}

function validationException(errors: ValidationError[]): BadRequestException {
  const passwordInvalid = errors.some(
    (error) => error.property === 'password' || error.property === 'newPassword',
  );

  return new BadRequestException({
    code: passwordInvalid ? 'INVALID_PASSWORD' : 'BAD_REQUEST',
    message: validationMessages(errors),
  });
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
    trustProxy: false,
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

  const adapter = app.getHttpAdapter() as FastifyAdapter;
  const server = adapter.getInstance();

  server.addHook('onSend', (request, reply, payload, done) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header(
      'permissions-policy',
      'camera=(), geolocation=(), microphone=()',
    );
    reply.header('x-permitted-cross-domain-policies', 'none');

    if (config.get<string>('NODE_ENV') === 'production') {
      reply.header('strict-transport-security', 'max-age=31536000');
    }

    done(null, payload);
  });

  server.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      {
        event: 'http.request.completed',
        requestId: request.id,
        correlationId: request.id,
        method: request.method,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime * 100) / 100,
      },
      'HTTP request completed',
    );
    done();
  });
}
