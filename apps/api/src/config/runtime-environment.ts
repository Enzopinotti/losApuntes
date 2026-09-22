const VALID_NODE_ENVIRONMENTS = new Set([
  'development',
  'test',
  'production',
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

function requiredString(
  config: Record<string, unknown>,
  key: string,
): string {
  const value = optionalString(config, key);

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function parsePort(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return 4000;
  }

  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return parsed;
}

function parseBoolean(
  value: unknown,
  key: string,
  fallback: boolean,
): boolean {
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

function parseWebOrigin(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error('WEB_ORIGIN must be a string');
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('WEB_ORIGIN must be a valid absolute HTTP(S) origin');
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('WEB_ORIGIN must be a valid absolute HTTP(S) origin');
  }

  return url.origin;
}

export function validateRuntimeEnvironment(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = optionalString(source, 'NODE_ENV') ?? 'development';

  if (!VALID_NODE_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test or production');
  }

  return {
    ...source,
    NODE_ENV: nodeEnv,
    PORT: parsePort(source.PORT),
    MONGO_URI: requiredString(source, 'MONGO_URI'),
    JWT_SECRET: requiredString(source, 'JWT_SECRET'),
    WEB_ORIGIN: parseWebOrigin(source.WEB_ORIGIN),
    SWAGGER_ENABLED: parseBoolean(
      source.SWAGGER_ENABLED,
      'SWAGGER_ENABLED',
      nodeEnv !== 'production',
    ),
  };
}
