import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const forbiddenPathPatterns = [
  /(^|\/)node_modules\//,
  /(^|\/)apps\/api\/data\//,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)WiredTiger/,
  /\.wt$/,
  /(^|\/)mongod\.lock$/,
  /(^|\/)journal\//,
  /(^|\/)package-lock\.json$/,
  /\.(?:pem|key|p12|pfx|jks)$/,
  /\.(?:sqlite|sqlite3|db)$/,
];

const allowedEnvExamples = new Set(['.env.example', 'apps/api/.env.example']);

const forbiddenPaths = tracked.filter((path) => {
  if (allowedEnvExamples.has(path)) return false;
  return forbiddenPathPatterns.some((pattern) => pattern.test(path));
});

if (forbiddenPaths.length > 0) {
  console.error('Repository hygiene check failed. Forbidden tracked paths:');
  for (const path of forbiddenPaths) console.error(` - ${path}`);
  process.exit(1);
}

const secretPatterns = [
  {
    name: 'private key',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: 'Google OAuth client secret',
    regex: /GOCSPX-[A-Za-z0-9_-]{10,}/,
  },
  {
    name: 'Google API key',
    regex: /AIza[0-9A-Za-z_-]{30,}/,
  },
  {
    name: 'GitHub token',
    regex: /gh[pousr]_[A-Za-z0-9_]{20,}/,
  },
  {
    name: 'npm access token',
    regex: /npm_[A-Za-z0-9]{20,}/,
  },
  {
    name: 'AWS access key',
    regex: /AKIA[0-9A-Z]{16}/,
  },
  {
    name: 'Slack token',
    regex: /xox[baprs]-[A-Za-z0-9-]{10,}/,
  },
];

const findings = [];

for (const path of tracked) {
  if (path === 'pnpm-lock.yaml') continue;

  let size;
  try {
    size = statSync(path).size;
  } catch {
    continue;
  }

  if (size > 2_000_000) continue;

  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    continue;
  }

  if (content.includes('\0')) continue;

  for (const pattern of secretPatterns) {
    if (pattern.regex.test(content)) {
      findings.push(`${path}: ${pattern.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error('Repository hygiene check failed. Potential secrets found:');
  for (const finding of findings) console.error(` - ${finding}`);
  process.exit(1);
}

console.log(`Repository hygiene OK (${tracked.length} tracked files checked).`);
