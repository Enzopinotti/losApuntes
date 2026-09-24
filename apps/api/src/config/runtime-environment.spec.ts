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
  DEPLOYMENT_PROFILE: 'production',
  WEB_ORIGIN: 'https://app.losapuntes.example',
  FILES_S3_PUBLIC_ENDPOINT: 'https://files.losapuntes.example',
  FILES_S3_ACCESS_KEY_ID: 'prod-files-access',
  FILES_S3_SECRET_ACCESS_KEY: 'prod-files-secret-value',
  AUTH_EMAIL_DELIVERY_MODE: 'smtp',
  AUTH_ACTION_BASE_URL: 'https://app.losapuntes.example',
  AUTH_EMAIL_FROM: 'Los Apuntes <no-reply@losapuntes.example>',
  AUTH_SMTP_HOST: 'smtp.example',
  AUTH_SMTP_PORT: '587',
  AUTH_SMTP_SECURE: 'false',
  AUTH_ABUSE_KEY_SECRET: 'production-auth-abuse-key-secret-2026',
};

describe('validateRuntimeEnvironment', () => {
  it('uses the local deployment profile outside production by default', () => {
    const result = validateRuntimeEnvironment(validEnvironment);

    expect(result.DEPLOYMENT_PROFILE).toBe('local');
  });

  it('defaults production NODE_ENV to the production deployment profile', () => {
    const result = validateRuntimeEnvironment({
      ...validProductionEnvironment,
      DEPLOYMENT_PROFILE: undefined,
    });

    expect(result.DEPLOYMENT_PROFILE).toBe('production');
  });

  it('allows known local storage credentials only for the isolated local production-mode stack', () => {
    const result = validateRuntimeEnvironment({
      ...validEnvironment,
      NODE_ENV: 'production',
      DEPLOYMENT_PROFILE: 'local',
      WEB_ORIGIN: 'http://localhost:5173',
      AUTH_EMAIL_DELIVERY_MODE: 'smtp',
      AUTH_ACTION_BASE_URL: 'http://localhost:5173',
      AUTH_EMAIL_FROM: 'Los Apuntes <no-reply@losapuntes.local>',
      AUTH_SMTP_HOST: 'mailpit',
      AUTH_SMTP_PORT: '1025',
      AUTH_SMTP_SECURE: 'false',
      FILES_S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
      FILES_S3_ACCESS_KEY_ID: 'losapuntes-local',
      FILES_S3_SECRET_ACCESS_KEY: 'losapuntes-local-files-secret',
    });

    expect(result.DEPLOYMENT_PROFILE).toBe('local');
  });

  it('rejects local production-mode profile when any public origin is not loopback', () => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        DEPLOYMENT_PROFILE: 'local',
        WEB_ORIGIN: 'https://app.example.com',
        AUTH_EMAIL_DELIVERY_MODE: 'smtp',
        AUTH_ACTION_BASE_URL: 'http://localhost:5173',
        AUTH_EMAIL_FROM: 'Los Apuntes <no-reply@losapuntes.local>',
        AUTH_SMTP_HOST: 'mailpit',
        FILES_S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
      }),
    ).toThrow(
      'DEPLOYMENT_PROFILE=local with NODE_ENV=production requires loopback public origins',
    );
  });

  it('requires HTTPS public origins in the production deployment profile', () => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validProductionEnvironment,
        WEB_ORIGIN: 'http://app.losapuntes.example',
      }),
    ).toThrow('WEB_ORIGIN must use https in the production deployment profile');

    expect(() =>
      validateRuntimeEnvironment({
        ...validProductionEnvironment,
        AUTH_ACTION_BASE_URL: 'http://app.losapuntes.example',
      }),
    ).toThrow(
      'AUTH_ACTION_BASE_URL must use https in the production deployment profile',
    );

    expect(() =>
      validateRuntimeEnvironment({
        ...validProductionEnvironment,
        FILES_S3_PUBLIC_ENDPOINT: 'http://files.losapuntes.example',
      }),
    ).toThrow(
      'FILES_S3_PUBLIC_ENDPOINT must use https in the production deployment profile',
    );
  });

  it('rejects production deployment profile unless NODE_ENV is production', () => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validEnvironment,
        DEPLOYMENT_PROFILE: 'production',
      }),
    ).toThrow('DEPLOYMENT_PROFILE=production requires NODE_ENV=production');
  });

  it('normalizes defaults for local development', () => {
    const result = validateRuntimeEnvironment(validEnvironment);

    expect(result).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      SWAGGER_ENABLED: true,
      AUTH_EMAIL_DELIVERY_MODE: 'disabled',
      GOOGLE_AUTH_ENABLED: false,
      GOOGLE_NATIVE_CLIENT_IDS: [],
      TRUSTED_PROXY_CIDRS: [],
    });
  });

  it('normalizes an explicit trusted proxy allowlist', () => {
    const result = validateRuntimeEnvironment({
      ...validEnvironment,
      TRUSTED_PROXY_CIDRS:
        '127.0.0.1, 10.20.0.0/16,2001:db8::1,2001:db8:abcd::/48',
    });

    expect(result.TRUSTED_PROXY_CIDRS).toEqual([
      '127.0.0.1',
      '10.20.0.0/16',
      '2001:db8::1',
      '2001:db8:abcd::/48',
    ]);
  });

  it.each([
    '*',
    'loopback',
    '10.0.0.0/99',
    '2001:db8::/129',
    'proxy.example.com',
  ])('rejects unsafe trusted proxy entry: %s', (entry) => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validEnvironment,
        TRUSTED_PROXY_CIDRS: entry,
      }),
    ).toThrow(
      'TRUSTED_PROXY_CIDRS must contain only comma-separated IP addresses or CIDR ranges',
    );
  });

  it('uses the isolated local Auth abuse secret only for local profile', () => {
    const result = validateRuntimeEnvironment(validEnvironment);

    expect(result.AUTH_ABUSE_KEY_SECRET).toBe(
      'losapuntes-local-auth-abuse-secret-2026',
    );
  });

  it('requires a strong explicit Auth abuse key in production profile', () => {
    const missing = { ...validProductionEnvironment };
    delete (missing as Partial<typeof validProductionEnvironment>)
      .AUTH_ABUSE_KEY_SECRET;

    expect(() => validateRuntimeEnvironment(missing)).toThrow(
      'AUTH_ABUSE_KEY_SECRET is required',
    );

    expect(() =>
      validateRuntimeEnvironment({
        ...validProductionEnvironment,
        AUTH_ABUSE_KEY_SECRET: 'too-short',
      }),
    ).toThrow('AUTH_ABUSE_KEY_SECRET must be at least 32 characters');

    expect(() =>
      validateRuntimeEnvironment({
        ...validProductionEnvironment,
        AUTH_ABUSE_KEY_SECRET: 'losapuntes-local-auth-abuse-secret-2026',
      }),
    ).toThrow(
      'AUTH_ABUSE_KEY_SECRET must not use the local development credential in production',
    );
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
      FILES_DOWNLOAD_URL_TTL_SECONDS: 300,
    });
  });

  it('rejects incomplete Files configuration', () => {
    const incomplete: Record<string, unknown> = { ...validEnvironment };
    delete incomplete.FILES_S3_BUCKET;
    expect(() => validateRuntimeEnvironment(incomplete)).toThrow(
      'FILES_S3_BUCKET is required',
    );
  });

  it('rejects invalid signed download TTLs', () => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validEnvironment,
        FILES_DOWNLOAD_URL_TTL_SECONDS: 0,
      }),
    ).toThrow(
      'FILES_DOWNLOAD_URL_TTL_SECONDS must be an integer between 1 and 300',
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

  it('rejects the known local S3 credentials in production', () => {
    expect(() =>
      validateRuntimeEnvironment({
        ...validProductionEnvironment,
        FILES_S3_ACCESS_KEY_ID: 'losapuntes-local',
      }),
    ).toThrow(
      'FILES_S3_ACCESS_KEY_ID must not use the local development credential in production',
    );

    expect(() =>
      validateRuntimeEnvironment({
        ...validProductionEnvironment,
        FILES_S3_SECRET_ACCESS_KEY: 'losapuntes-local-files-secret',
      }),
    ).toThrow(
      'FILES_S3_SECRET_ACCESS_KEY must not use the local development credential in production',
    );
  });

  it('does not require the removed legacy JWT secret', () => {
    expect(() => validateRuntimeEnvironment(validEnvironment)).not.toThrow();
  });
});
