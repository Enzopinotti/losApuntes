import { isIP } from 'node:net';

const VALID_NODE_ENVIRONMENTS = new Set(['development', 'test', 'production']);
const VALID_AUTH_EMAIL_DELIVERY_MODES = new Set(['disabled', 'smtp']);
const VALID_DEPLOYMENT_PROFILES = new Set(['local', 'production']);
const LOCAL_AUTH_ABUSE_KEY_SECRET =
  'losapuntes-local-auth-abuse-secret-2026';
const KNOWN_LOCAL_PRODUCTION_CREDENTIALS = new Map<string, Set<string>>([
  ['FILES_S3_ACCESS_KEY_ID', new Set(['losapuntes-local'])],
  ['FILES_S3_SECRET_ACCESS_KEY', new Set(['losapuntes-local-files-secret'])],
  ['AUTH_ABUSE_KEY_SECRET', new Set([LOCAL_AUTH_ABUSE_KEY_SECRET])],
]);

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

function parseBoundedInteger(
  value: unknown,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${key} must be an integer between ${minimum} and ${maximum}`,
    );
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

function isLoopbackHttpOrigin(value: string | undefined): boolean {
  if (!value) return false;

  const url = new URL(value);
  return (
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    ['http:', 'https:'].includes(url.protocol)
  );
}

function requireHttpsOrigin(value: string | undefined, key: string): void {
  if (!value || new URL(value).protocol !== 'https:') {
    throw new Error(
      `${key} must use https in the production deployment profile`,
    );
  }
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

function validIpOrCidr(value: string): boolean {
  const [address, prefix, ...rest] = value.split('/');
  if (rest.length > 0 || !address) {
    return false;
  }

  const version = isIP(address);
  if (version === 0) {
    return false;
  }

  if (prefix === undefined) {
    return true;
  }

  if (!/^\d+$/u.test(prefix)) {
    return false;
  }

  const bits = Number(prefix);
  return (
    Number.isInteger(bits) && bits >= 0 && bits <= (version === 4 ? 32 : 128)
  );
}

export function parseTrustedProxyCidrs(value: unknown): string[] {
  const entries = parseStringList(value, 'TRUSTED_PROXY_CIDRS');

  for (const entry of entries) {
    if (!validIpOrCidr(entry)) {
      throw new Error(
        'TRUSTED_PROXY_CIDRS must contain only comma-separated IP addresses or CIDR ranges',
      );
    }
  }

  return entries;
}

function rejectKnownLocalProductionCredential(
  nodeEnv: string,
  deploymentProfile: string,
  key: string,
  value: string,
): void {
  if (
    nodeEnv === 'production' &&
    deploymentProfile === 'production' &&
    KNOWN_LOCAL_PRODUCTION_CREDENTIALS.get(key)?.has(value)
  ) {
    throw new Error(
      `${key} must not use the local development credential in production`,
    );
  }
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

  const deploymentProfile =
    optionalString(source, 'DEPLOYMENT_PROFILE') ??
    (nodeEnv === 'production' ? 'production' : 'local');

  if (!VALID_DEPLOYMENT_PROFILES.has(deploymentProfile)) {
    throw new Error('DEPLOYMENT_PROFILE must be local or production');
  }

  if (deploymentProfile === 'production' && nodeEnv !== 'production') {
    throw new Error(
      'DEPLOYMENT_PROFILE=production requires NODE_ENV=production',
    );
  }

  const mongoUri = requiredString(source, 'MONGO_URI');
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
  const filesStorageProvider = requiredString(source, 'FILES_STORAGE_PROVIDER');
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
  const trustedProxyCidrs = parseTrustedProxyCidrs(source.TRUSTED_PROXY_CIDRS);
  const authAbuseKeySecret =
    optionalString(source, 'AUTH_ABUSE_KEY_SECRET') ??
    (deploymentProfile === 'local' ? LOCAL_AUTH_ABUSE_KEY_SECRET : undefined);

  if (!authAbuseKeySecret) {
    throw new Error('AUTH_ABUSE_KEY_SECRET is required');
  }

  if (authAbuseKeySecret.length < 32) {
    throw new Error('AUTH_ABUSE_KEY_SECRET must be at least 32 characters');
  }

  rejectKnownLocalProductionCredential(
    nodeEnv,
    deploymentProfile,
    'AUTH_ABUSE_KEY_SECRET',
    authAbuseKeySecret,
  );

  const filesS3AccessKeyId = requiredString(source, 'FILES_S3_ACCESS_KEY_ID');
  const filesS3SecretAccessKey = requiredString(
    source,
    'FILES_S3_SECRET_ACCESS_KEY',
  );

  rejectKnownLocalProductionCredential(
    nodeEnv,
    deploymentProfile,
    'FILES_S3_ACCESS_KEY_ID',
    filesS3AccessKeyId,
  );
  rejectKnownLocalProductionCredential(
    nodeEnv,
    deploymentProfile,
    'FILES_S3_SECRET_ACCESS_KEY',
    filesS3SecretAccessKey,
  );

  if (nodeEnv === 'production' && deploymentProfile === 'local') {
    if (
      !isLoopbackHttpOrigin(webOrigin) ||
      !isLoopbackHttpOrigin(authActionBaseUrl) ||
      !isLoopbackHttpOrigin(filesS3PublicEndpoint)
    ) {
      throw new Error(
        'DEPLOYMENT_PROFILE=local with NODE_ENV=production requires loopback public origins',
      );
    }
  }

  if (deploymentProfile === 'production') {
    requireHttpsOrigin(webOrigin, 'WEB_ORIGIN');
    requireHttpsOrigin(authActionBaseUrl, 'AUTH_ACTION_BASE_URL');
    requireHttpsOrigin(filesS3PublicEndpoint, 'FILES_S3_PUBLIC_ENDPOINT');
  }

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
    DEPLOYMENT_PROFILE: deploymentProfile,
    PORT: parsePort(source.PORT, 'PORT', 4000),
    MONGO_URI: mongoUri,
    WEB_ORIGIN: webOrigin,
    SWAGGER_ENABLED: parseBoolean(
      source.SWAGGER_ENABLED,
      'SWAGGER_ENABLED',
      nodeEnv !== 'production',
    ),
    TRUSTED_PROXY_CIDRS: trustedProxyCidrs,
    AUTH_EMAIL_DELIVERY_MODE: deliveryMode,
    AUTH_ABUSE_KEY_SECRET: authAbuseKeySecret,
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
    FILES_S3_ACCESS_KEY_ID: filesS3AccessKeyId,
    FILES_S3_SECRET_ACCESS_KEY: filesS3SecretAccessKey,
    FILES_DOWNLOAD_URL_TTL_SECONDS: parseBoundedInteger(
      source.FILES_DOWNLOAD_URL_TTL_SECONDS,
      'FILES_DOWNLOAD_URL_TTL_SECONDS',
      300,
      1,
      300,
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
