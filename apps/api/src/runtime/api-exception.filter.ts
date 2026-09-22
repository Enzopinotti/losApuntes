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

function clientMessage(exception: HttpException): ClientMessage {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  if (
    typeof response === 'object' &&
    response !== null &&
    'message' in response
  ) {
    const message = response.message;

    if (
      typeof message === 'string' ||
      (Array.isArray(message) &&
        message.every((value) => typeof value === 'string'))
    ) {
      return message;
    }
  }

  return exception.message;
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

    const code = isServerError
      ? 'INTERNAL_SERVER_ERROR'
      : (CLIENT_ERROR_CODES[statusCode] ?? 'HTTP_ERROR');
    const message: ClientMessage = isServerError
      ? 'Internal server error'
      : exception instanceof HttpException
        ? clientMessage(exception)
        : 'Request failed';

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

    reply.header('x-request-id', requestId).status(statusCode).send({
      statusCode,
      code,
      message,
      requestId,
    });
  }
}
