import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { IsString } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import * as request from 'supertest';

import { configureHttpRuntime, createHttpAdapter } from './http-runtime';

class RuntimeProbeDto {
  @IsString()
  value!: string;
}

class PasswordProbeDto {
  @IsString()
  newPassword!: string;
}

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

  @Get('ip')
  ip(@Req() request: FastifyRequest) {
    return { ip: request.ip };
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
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toBe(
      'camera=(), geolocation=(), microphone=()',
    );
    expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
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
