import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { IsString } from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as request from 'supertest';

import {
  configureHttpRuntime,
  createHttpAdapter,
  requestCompletionLogFields,
} from './http-runtime';

class RuntimeProbeDto {
  @IsString()
  value!: string;
}

class PasswordProbeDto {
  @IsString()
  newPassword!: string;
}

type AuthAwareProbeRequest = FastifyRequest & {
  user?: { id: string };
};

let holdStarted: Promise<void>;
let signalHoldStarted: () => void = () => undefined;
let holdRelease: Promise<void>;
let releaseHold: () => void = () => undefined;

function resetHoldGate(): void {
  holdStarted = new Promise((resolve) => {
    signalHoldStarted = resolve;
  });
  holdRelease = new Promise((resolve) => {
    releaseHold = resolve;
  });
}

resetHoldGate();

function responseIp(body: unknown): string {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('ip' in body) ||
    typeof body.ip !== 'string'
  ) {
    throw new Error('Runtime IP probe returned an invalid response body');
  }

  return body.ip;
}

@Controller('runtime-probe')
class RuntimeProbeController {
  @Get()
  ok() {
    return { ok: true };
  }

  @Get('private-cache')
  privateCache(@Req() probeRequest: AuthAwareProbeRequest) {
    probeRequest.user = { id: 'user-1' };
    return { ok: true };
  }

  @Get('hold')
  async hold() {
    signalHoldStarted();
    await holdRelease;
    return { ok: true };
  }

  @Get('ip')
  ip(@Req() probeRequest: FastifyRequest) {
    return { ip: probeRequest.ip };
  }

  @Get('rate-limited')
  rateLimited(): never {
    throw new HttpException(
      {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts',
        retryAfterSeconds: 17,
      },
      429,
    );
  }

  @Get('auth-abuse-unavailable')
  authAbuseUnavailable(): never {
    throw new ServiceUnavailableException({
      code: 'AUTH_ABUSE_CONTROL_UNAVAILABLE',
      message: 'Authentication admission control is temporarily unavailable',
    });
  }

  @Get('fail')
  fail(): never {
    throw new Error(
      'mongodb://user:password@private.example.invalid/losapuntes',
    );
  }

  @Post()
  create(@Body() dto: RuntimeProbeDto) {
    return dto;
  }

  @Post('password')
  password(@Body() dto: PasswordProbeDto) {
    return dto;
  }
}

describe('HTTP runtime boundary', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    resetHoldGate();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RuntimeProbeController],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
      createHttpAdapter({ logger: false }),
    );

    configureHttpRuntime(
      app,
      new ConfigService({
        WEB_ORIGIN: 'http://localhost:5173',
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    releaseHold();
    await app.close();
  });

  it('generates its own request id and returns baseline safety headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/runtime-probe')
      .set('x-request-id', 'attacker-controlled')
      .expect(200);

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(response.headers['x-request-id']).not.toBe('attacker-controlled');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toBe(
      'camera=(), geolocation=(), microphone=()',
    );
    expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
  });

  it('marks authenticated responses private and non-cacheable', async () => {
    const response = await request(app.getHttpServer())
      .get('/runtime-probe/private-cache')
      .expect(200);

    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('keeps client and server error envelopes non-cacheable', async () => {
    const badRequest = await request(app.getHttpServer())
      .post('/runtime-probe')
      .send({ value: 'ok', unexpected: true })
      .expect(400);
    const serverError = await request(app.getHttpServer())
      .get('/runtime-probe/fail')
      .expect(500);

    expect(badRequest.headers['cache-control']).toBe('no-store');
    expect(serverError.headers['cache-control']).toBe('no-store');
  });

  it('rejects unknown DTO fields with the stable error envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/runtime-probe')
      .send({ value: 'ok', unexpected: true })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
    expect(response.body).toHaveProperty(
      'requestId',
      response.headers['x-request-id'],
    );
    expect(response.body).toHaveProperty(
      'message',
      expect.arrayContaining(['property unexpected should not exist']),
    );
  });

  it('returns a stable code for password validation failures', async () => {
    const response = await request(app.getHttpServer())
      .post('/runtime-probe/password')
      .send({ newPassword: 123 })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'INVALID_PASSWORD',
    });
    expect(response.body).toHaveProperty(
      'requestId',
      response.headers['x-request-id'],
    );
  });

  it('propagates stable Retry-After metadata for bounded 429 responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/runtime-probe/rate-limited')
      .expect(429);

    expect(response.headers['retry-after']).toBe('17');
    expect(response.body).toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts',
      retryAfterSeconds: 17,
      requestId: response.headers['x-request-id'],
    });
  });

  it('rejects excess in-flight work with bounded retry metadata', async () => {
    await app.close();
    resetHoldGate();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RuntimeProbeController],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
      createHttpAdapter({ logger: false }),
    );
    configureHttpRuntime(
      app,
      new ConfigService({
        WEB_ORIGIN: 'http://localhost:5173',
        API_MAX_IN_FLIGHT_REQUESTS: 1,
        API_ADMISSION_RETRY_AFTER_SECONDS: 3,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const firstRequest = request(app.getHttpServer()).get(
      '/runtime-probe/hold',
    );
    const firstPromise = firstRequest.then((response) => response);

    await holdStarted;

    const rejected = await request(app.getHttpServer())
      .get('/runtime-probe')
      .expect(429);

    expect(rejected.headers['retry-after']).toBe('3');
    expect(rejected.headers['cache-control']).toBe('no-store');
    expect(rejected.body).toEqual({
      statusCode: 429,
      code: 'API_CAPACITY_LIMITED',
      message: 'API capacity is temporarily limited',
      retryAfterSeconds: 3,
      requestId: rejected.headers['x-request-id'],
    });

    releaseHold();
    const admitted = await firstPromise;
    expect(admitted.status).toBe(200);
  });

  it('preserves the bounded abuse-control unavailable contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/runtime-probe/auth-abuse-unavailable')
      .expect(503);

    expect(response.body).toEqual({
      statusCode: 503,
      code: 'AUTH_ABUSE_CONTROL_UNAVAILABLE',
      message: 'Authentication admission control is temporarily unavailable',
      requestId: response.headers['x-request-id'],
    });
  });

  it('sanitizes unexpected server errors and keeps their request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/runtime-probe/fail')
      .expect(500);

    expect(response.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      requestId: response.headers['x-request-id'],
    });
    expect(JSON.stringify(response.body)).not.toContain('private.example');
    expect(JSON.stringify(response.body)).not.toContain('password');
  });

  it('logs only the route template, never the request query', () => {
    const fields = requestCompletionLogFields(
      {
        id: 'request-1',
        method: 'GET',
        url: '/runtime-probe?token=sensitive-value',
        routeOptions: { url: '/runtime-probe' },
      } as unknown as FastifyRequest,
      {
        statusCode: 200,
        elapsedTime: 12.345,
      } as FastifyReply,
    );

    expect(fields).toMatchObject({
      event: 'http.request.completed',
      requestId: 'request-1',
      method: 'GET',
      route: '/runtime-probe',
      statusCode: 200,
      durationMs: 12.35,
    });
    expect(JSON.stringify(fields)).not.toContain('sensitive-value');
    expect(JSON.stringify(fields)).not.toContain('?token=');
  });

  it('does not trust forwarded client addresses by default', async () => {
    const response = await request(app.getHttpServer())
      .get('/runtime-probe/ip')
      .set('x-forwarded-for', '198.51.100.42')
      .expect(200);

    expect(responseIp(response.body as unknown)).not.toBe('198.51.100.42');
  });

  it('trusts forwarded client addresses only through an explicit proxy allowlist', async () => {
    await app.close();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RuntimeProbeController],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(
      createHttpAdapter({ logger: false, trustProxy: ['127.0.0.1', '::1'] }),
    );

    configureHttpRuntime(
      app,
      new ConfigService({
        WEB_ORIGIN: 'http://localhost:5173',
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const response = await request(app.getHttpServer())
      .get('/runtime-probe/ip')
      .set('x-forwarded-for', '198.51.100.42')
      .expect(200);

    expect(responseIp(response.body as unknown)).toBe('198.51.100.42');
  });

  it('allows only the configured browser origin', async () => {
    const allowed = await request(app.getHttpServer())
      .options('/runtime-probe')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );

    const denied = await request(app.getHttpServer())
      .options('/runtime-probe')
      .set('Origin', 'https://untrusted.example')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);

    expect(denied.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(denied.headers['access-control-allow-origin']).not.toBe(
      'https://untrusted.example',
    );
  });
});
