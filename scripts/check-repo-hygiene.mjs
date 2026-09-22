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
  /\.pem$/,
  /\.key$/,
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
  { name: 'private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Google OAuth client secret', regex: /GOCSPX-[A-Za-z0-9_-]{10,}/ },
  { name: 'GitHub personal access token', regex: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
];

const findings = [];

for (const path of tracked) {
  if (path.endsWith('package-lock.json')) continue;

  let size;
  try {
    size = statSync(path).size;
  } catch {
    continue;
  }

  if (size > 1_000_000) continue;

  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    continue;
  }

  if (text.includes('\0')) continue;

  for (const pattern of secretPatterns) {
    if (pattern.regex.test(text)) findings.push(`${path}: ${pattern.name}`);
  }
}

if (findings.length > 0) {
  console.error('Repository hygiene check failed. Potential secrets found:');
  for (const finding of findings) console.error(` - ${finding}`);
  process.exit(1);
}

console.log(`Repository hygiene OK (${tracked.length} tracked files checked).`);
