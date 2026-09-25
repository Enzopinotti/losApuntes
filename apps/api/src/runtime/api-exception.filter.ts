import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

interface RuntimeRequest {
  id?: string;
  log?: {
    error(fields: Record<string, unknown>, message?: string): void;
  };
}

interface RuntimeReply {
  header(name: string, value: string): RuntimeReply;
  status(code: number): RuntimeReply;
  send(payload: unknown): unknown;
}

type ClientMessage = string | string[];

const CLIENT_ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

const EXPOSED_SERVER_ERROR_CODES = new Set([
  'AUTH_ABUSE_CONTROL_UNAVAILABLE',
]);

function responseObject(
  exception: HttpException,
): Record<string, unknown> | null {
  const response = exception.getResponse();

  return typeof response === 'object' && response !== null
    ? (response as Record<string, unknown>)
    : null;
}

function clientMessage(exception: HttpException): ClientMessage {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  const object = responseObject(exception);
  const message = object?.message;

  if (
    typeof message === 'string' ||
    (Array.isArray(message) &&
      message.every((value) => typeof value === 'string'))
  ) {
    return message;
  }

  return exception.message;
}

function retryAfterSeconds(
  exception: HttpException,
  statusCode: number,
): number | null {
  if (statusCode !== 429) return null;

  const value = responseObject(exception)?.retryAfterSeconds;
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 86_400
    ? value
    : null;
}

function clientCode(exception: HttpException, statusCode: number): string {
  const code = responseObject(exception)?.code;

  if (typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/u.test(code)) {
    return code;
  }

  return CLIENT_ERROR_CODES[statusCode] ?? 'HTTP_ERROR';
}

function canExposeServerError(exception: HttpException): boolean {
  const code = responseObject(exception)?.code;

  return typeof code === 'string' && EXPOSED_SERVER_ERROR_CODES.has(code);
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RuntimeRequest>();
    const reply = http.getResponse<RuntimeReply>();
    const requestId =
      typeof request.id === 'string' && request.id.length > 0
        ? request.id
        : randomUUID();

    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const isServerError = statusCode >= 500;
    const exposedHttpError =
      exception instanceof HttpException &&
      (!isServerError || canExposeServerError(exception));

    const code = exposedHttpError
      ? clientCode(exception, statusCode)
      : isServerError
        ? 'INTERNAL_SERVER_ERROR'
        : 'HTTP_ERROR';
    const message: ClientMessage = exposedHttpError
      ? clientMessage(exception)
      : isServerError
        ? 'Internal server error'
        : 'Request failed';

    const retryAfter =
      exception instanceof HttpException
        ? retryAfterSeconds(exception, statusCode)
        : null;

    if (isServerError) {
      request.log?.error(
        {
          event: 'http.request.failed',
          requestId,
          correlationId: requestId,
          statusCode,
          errorType:
            exception instanceof Error ? exception.name : 'UnknownError',
        },
        'HTTP request failed',
      );
    }

    reply.header('x-request-id', requestId);

    if (retryAfter !== null) {
      reply.header('retry-after', String(retryAfter));
    }

    reply.status(statusCode).send({
      statusCode,
      code,
      message,
      ...(retryAfter !== null ? { retryAfterSeconds: retryAfter } : {}),
      requestId,
    });
  }
}
