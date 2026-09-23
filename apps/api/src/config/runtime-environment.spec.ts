import { validateRuntimeEnvironment } from './runtime-environment';

const validEnvironment = {
  MONGO_URI: 'mongodb://127.0.0.1:27017/losapuntes',
  FILES_STORAGE_PROVIDER: 's3',
  FILES_S3_ENDPOINT: 'http://127.0.0.1:9000',
  FILES_S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  FILES_S3_REGION: 'us-east-1',
  FILES_S3_BUCKET: 'losapuntes-files',
  FILES_S3_ACCESS_KEY_ID: 'test-files',
  FILES_S3_SECRET_ACCESS_KEY: 'test-files-secret',
};

const validProductionEnvironment = {
  ...validEnvironment,
  NODE_ENV: 'production',
  AUTH_EMAIL_DELIVERY_MODE: 'smtp',
  AUTH_ACTION_BASE_URL: 'https://app.losapuntes.example',
  AUTH_EMAIL_FROM: 'Los Apuntes <no-reply@losapuntes.example>',
  AUTH_SMTP_HOST: 'smtp.example',
  AUTH_SMTP_PORT: '587',
  AUTH_SMTP_SECURE: 'false',
};

describe('validateRuntimeEnvironment', () => {
  it('normalizes defaults for local development', () => {
    const result = validateRuntimeEnvironment(validEnvironment);

    expect(result).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      SWAGGER_ENABLED: true,
      AUTH_EMAIL_DELIVERY_MODE: 'disabled',
      GOOGLE_AUTH_ENABLED: false,
      GOOGLE_NATIVE_CLIENT_IDS: [],
    });
  });

  it('disables Swagger by default in a valid production environment', () => {
    const result = validateRuntimeEnvironment(validProductionEnvironment);

    expect(result.SWAGGER_ENABLED).toBe(false);
  });

  it('allows production Swagger only when explicitly enabled', () => {
    const result = validateRuntimeEnvironment({
      ...validProductionEnvironment,
      SWAGGER_ENABLED: 'true',
    });

    expect(result.SWAGGER_ENABLED).toBe(true);
  });

  it('requires SMTP delivery in production', () => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        AUTH_EMAIL_DELIVERY_MODE: 'disabled',
      }),
    ).toThrow('AUTH_EMAIL_DELIVERY_MODE must be smtp in production');
  });

  it('rejects production startup when delivery mode is omitted', () => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
      }),
    ).toThrow('AUTH_EMAIL_DELIVERY_MODE');
  });

  it('requires the SMTP delivery dependencies when smtp mode is enabled', () => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validEnvironment,
        AUTH_EMAIL_DELIVERY_MODE: 'smtp',
      }),
    ).toThrow('AUTH_ACTION_BASE_URL is required');
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

  it('requires complete Google Web config when Google Auth is enabled', () => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validEnvironment,
        GOOGLE_AUTH_ENABLED: 'true',
        WEB_ORIGIN: 'http://localhost:5173',
      }),
    ).toThrow('Google Web auth requires');
  });

  it('normalizes enabled Google config and native audiences', () => {
    const result = validateRuntimeEnvironment({
      ...validEnvironment,
      WEB_ORIGIN: 'http://localhost:5173',
      GOOGLE_AUTH_ENABLED: 'true',
      GOOGLE_WEB_CLIENT_ID: 'web-client.apps.googleusercontent.com',
      GOOGLE_WEB_CLIENT_SECRET: 'test-secret',
      GOOGLE_WEB_REDIRECT_URI: 'http://localhost:4000/auth/google/web/callback',
      GOOGLE_NATIVE_CLIENT_IDS:
        'ios-client.apps.googleusercontent.com, android-client.apps.googleusercontent.com,ios-client.apps.googleusercontent.com',
    });

    expect(result).toMatchObject({
      GOOGLE_AUTH_ENABLED: true,
      GOOGLE_WEB_REDIRECT_URI: 'http://localhost:4000/auth/google/web/callback',
      GOOGLE_NATIVE_CLIENT_IDS: [
        'ios-client.apps.googleusercontent.com',
        'android-client.apps.googleusercontent.com',
      ],
    });
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

  it('normalizes required Files configuration', () => {
    const result = validateRuntimeEnvironment(validEnvironment);

    expect(result).toMatchObject({
      FILES_STORAGE_PROVIDER: 's3',
      FILES_S3_ENDPOINT: 'http://127.0.0.1:9000',
      FILES_S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
      FILES_S3_REGION: 'us-east-1',
      FILES_S3_BUCKET: 'losapuntes-files',
    });
  });

  it('rejects incomplete Files configuration', () => {
    const { FILES_S3_BUCKET: _bucket, ...incomplete } = validEnvironment;
    expect(() => validateRuntimeEnvironment(incomplete)).toThrow(
      'FILES_S3_BUCKET is required',
    );
  });

  it('rejects unsupported Files providers', () => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validEnvironment,
        FILES_STORAGE_PROVIDER: 'public-http',
      }),
    ).toThrow('FILES_STORAGE_PROVIDER must be s3');
  });

  it.each([
    'not-a-url',
    'ftp://storage.example.com',
    'https://storage.example.com/path',
  ])('rejects invalid Files S3 endpoint: %s', (endpoint) => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validEnvironment,
        FILES_S3_ENDPOINT: endpoint,
      }),
    ).toThrow('FILES_S3_ENDPOINT must be a valid absolute HTTP(S) origin');
  });

  it('requires the database URI before bootstrap', () => {
    expect(() => validateRuntimeEnvironment({})).toThrow(
      'MONGO_URI is required',
    );
  });

  it('does not require the removed legacy JWT secret', () => {
    expect(() => validateRuntimeEnvironment(validEnvironment)).not.toThrow();
  });
});
