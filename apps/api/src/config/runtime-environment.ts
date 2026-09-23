const VALID_NODE_ENVIRONMENTS = new Set(['development', 'test', 'production']);
const VALID_AUTH_EMAIL_DELIVERY_MODES = new Set(['disabled', 'smtp']);

function optionalString(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = config[key];

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requiredString(config: Record<string, unknown>, key: string): string {
  const value = optionalString(config, key);

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function parsePort(value: unknown, key: string, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${key} must be an integer between 1 and 65535`);
  }

  return parsed;
}

function parseBoolean(value: unknown, key: string, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  throw new Error(`${key} must be true or false`);
}

function parseHttpOrigin(value: unknown, key: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string`);
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${key} must be a valid absolute HTTP(S) origin`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${key} must be a valid absolute HTTP(S) origin`);
  }

  return url.origin;
}

function parseHttpUrl(value: unknown, key: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string`);
  }

  try {
    const url = new URL(value.trim());

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw new Error(`${key} must be a valid absolute HTTP(S) URL`);
  }
}

function parseStringList(value: unknown, key: string): string[] {
  const raw = optionalString({ [key]: value }, key);
  if (!raw) {
    return [];
  }

  return [
    ...new Set(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function authEmailDeliveryMode(
  source: Record<string, unknown>,
  nodeEnv: string,
): 'disabled' | 'smtp' {
  const value =
    optionalString(source, 'AUTH_EMAIL_DELIVERY_MODE') ??
    (nodeEnv === 'production' ? undefined : 'disabled');

  if (!value || !VALID_AUTH_EMAIL_DELIVERY_MODES.has(value)) {
    throw new Error('AUTH_EMAIL_DELIVERY_MODE must be disabled or smtp');
  }

  if (nodeEnv === 'production' && value !== 'smtp') {
    throw new Error('AUTH_EMAIL_DELIVERY_MODE must be smtp in production');
  }

  return value as 'disabled' | 'smtp';
}

export function validateRuntimeEnvironment(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = optionalString(source, 'NODE_ENV') ?? 'development';

  if (!VALID_NODE_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test or production');
  }

  const deliveryMode = authEmailDeliveryMode(source, nodeEnv);
  const authActionBaseUrl = parseHttpOrigin(
    source.AUTH_ACTION_BASE_URL,
    'AUTH_ACTION_BASE_URL',
  );
  const smtpUser = optionalString(source, 'AUTH_SMTP_USER');
  const smtpPass = optionalString(source, 'AUTH_SMTP_PASS');
  const googleAuthEnabled = parseBoolean(
    source.GOOGLE_AUTH_ENABLED,
    'GOOGLE_AUTH_ENABLED',
    false,
  );
  const webOrigin = parseHttpOrigin(source.WEB_ORIGIN, 'WEB_ORIGIN');
  const googleWebClientId = optionalString(source, 'GOOGLE_WEB_CLIENT_ID');
  const googleWebClientSecret = optionalString(
    source,
    'GOOGLE_WEB_CLIENT_SECRET',
  );
  const googleWebRedirectUri = parseHttpUrl(
    source.GOOGLE_WEB_REDIRECT_URI,
    'GOOGLE_WEB_REDIRECT_URI',
  );
  const googleNativeClientIds = parseStringList(
    source.GOOGLE_NATIVE_CLIENT_IDS,
    'GOOGLE_NATIVE_CLIENT_IDS',
  );
  const filesStorageProvider = requiredString(
    source,
    'FILES_STORAGE_PROVIDER',
  );
  if (filesStorageProvider !== 's3') {
    throw new Error('FILES_STORAGE_PROVIDER must be s3');
  }
  const filesS3Endpoint = parseHttpOrigin(
    source.FILES_S3_ENDPOINT,
    'FILES_S3_ENDPOINT',
  );
  const filesS3PublicEndpoint = parseHttpOrigin(
    source.FILES_S3_PUBLIC_ENDPOINT,
    'FILES_S3_PUBLIC_ENDPOINT',
  );

  if (Boolean(smtpUser) !== Boolean(smtpPass)) {
    throw new Error(
      'AUTH_SMTP_USER and AUTH_SMTP_PASS must be configured together',
    );
  }

  if (
    googleAuthEnabled &&
    (!webOrigin ||
      !googleWebClientId ||
      !googleWebClientSecret ||
      !googleWebRedirectUri)
  ) {
    throw new Error(
      'Google Web auth requires WEB_ORIGIN, GOOGLE_WEB_CLIENT_ID, GOOGLE_WEB_CLIENT_SECRET and GOOGLE_WEB_REDIRECT_URI',
    );
  }

  const result: Record<string, unknown> = {
    ...source,
    NODE_ENV: nodeEnv,
    PORT: parsePort(source.PORT, 'PORT', 4000),
    MONGO_URI: requiredString(source, 'MONGO_URI'),
    WEB_ORIGIN: webOrigin,
    SWAGGER_ENABLED: parseBoolean(
      source.SWAGGER_ENABLED,
      'SWAGGER_ENABLED',
      nodeEnv !== 'production',
    ),
    AUTH_EMAIL_DELIVERY_MODE: deliveryMode,
    AUTH_ACTION_BASE_URL: authActionBaseUrl,
    AUTH_SMTP_PORT: parsePort(source.AUTH_SMTP_PORT, 'AUTH_SMTP_PORT', 587),
    AUTH_SMTP_SECURE: parseBoolean(
      source.AUTH_SMTP_SECURE,
      'AUTH_SMTP_SECURE',
      false,
    ),
    AUTH_SMTP_USER: smtpUser,
    AUTH_SMTP_PASS: smtpPass,
    GOOGLE_AUTH_ENABLED: googleAuthEnabled,
    GOOGLE_WEB_CLIENT_ID: googleWebClientId,
    GOOGLE_WEB_CLIENT_SECRET: googleWebClientSecret,
    GOOGLE_WEB_REDIRECT_URI: googleWebRedirectUri,
    GOOGLE_NATIVE_CLIENT_IDS: googleNativeClientIds,
    FILES_STORAGE_PROVIDER: filesStorageProvider,
    FILES_S3_ENDPOINT:
      filesS3Endpoint ?? requiredString(source, 'FILES_S3_ENDPOINT'),
    FILES_S3_PUBLIC_ENDPOINT:
      filesS3PublicEndpoint ??
      requiredString(source, 'FILES_S3_PUBLIC_ENDPOINT'),
    FILES_S3_REGION: requiredString(source, 'FILES_S3_REGION'),
    FILES_S3_BUCKET: requiredString(source, 'FILES_S3_BUCKET'),
    FILES_S3_ACCESS_KEY_ID: requiredString(source, 'FILES_S3_ACCESS_KEY_ID'),
    FILES_S3_SECRET_ACCESS_KEY: requiredString(
      source,
      'FILES_S3_SECRET_ACCESS_KEY',
    ),
  };

  if (deliveryMode === 'smtp') {
    result.AUTH_ACTION_BASE_URL =
      authActionBaseUrl ?? requiredString(source, 'AUTH_ACTION_BASE_URL');
    result.AUTH_EMAIL_FROM = requiredString(source, 'AUTH_EMAIL_FROM');
    result.AUTH_SMTP_HOST = requiredString(source, 'AUTH_SMTP_HOST');
  }

  return result;
}
