import { Body, Controller, Get, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { IsString } from 'class-validator';
import * as request from 'supertest';

import { configureHttpRuntime, createHttpAdapter } from './http-runtime';

class RuntimeProbeDto {
  @IsString()
  value!: string;
}

@Controller('runtime-probe')
class RuntimeProbeController {
  @Get()
  ok() {
    return { ok: true };
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
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(response.body.message).toEqual(
      expect.arrayContaining(['property unexpected should not exist']),
    );
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

    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
