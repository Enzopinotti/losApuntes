import { validateRuntimeEnvironment } from './runtime-environment';

const validEnvironment = {
  MONGO_URI: 'mongodb://127.0.0.1:27017/losapuntes',
  JWT_SECRET: 'test-secret',
};

describe('validateRuntimeEnvironment', () => {
  it('normalizes defaults for local development', () => {
    const result = validateRuntimeEnvironment(validEnvironment);

    expect(result).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      SWAGGER_ENABLED: true,
    });
  });

  it('disables Swagger by default in production', () => {
    const result = validateRuntimeEnvironment({
      ...validEnvironment,
      NODE_ENV: 'production',
    });

    expect(result.SWAGGER_ENABLED).toBe(false);
  });

  it('allows production Swagger only when explicitly enabled', () => {
    const result = validateRuntimeEnvironment({
      ...validEnvironment,
      NODE_ENV: 'production',
      SWAGGER_ENABLED: 'true',
    });

    expect(result.SWAGGER_ENABLED).toBe(true);
  });

  it('normalizes a configured browser origin', () => {
    const result = validateRuntimeEnvironment({
      ...validEnvironment,
      WEB_ORIGIN: 'https://app.example.com/',
    });

    expect(result.WEB_ORIGIN).toBe('https://app.example.com');
  });

  it.each([
    'https://app.example.com/path',
    'ftp://app.example.com',
    'not-a-url',
  ])('rejects unsafe WEB_ORIGIN values: %s', (origin) => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validEnvironment,
        WEB_ORIGIN: origin,
      }),
    ).toThrow('WEB_ORIGIN must be a valid absolute HTTP(S) origin');
  });

  it.each([0, 65_536, 'abc', 2.5])(
    'rejects invalid PORT values: %p',
    (port) => {
      expect(() =>
        validateRuntimeEnvironment({
          ...validEnvironment,
          PORT: port,
        }),
      ).toThrow('PORT must be an integer between 1 and 65535');
    },
  );

  it('requires the database URI before bootstrap', () => {
    expect(() =>
      validateRuntimeEnvironment({
        JWT_SECRET: 'test-secret',
      }),
    ).toThrow('MONGO_URI is required');
  });

  it('requires the JWT secret before bootstrap', () => {
    expect(() =>
      validateRuntimeEnvironment({
        MONGO_URI: validEnvironment.MONGO_URI,
      }),
    ).toThrow('JWT_SECRET is required');
  });
});
