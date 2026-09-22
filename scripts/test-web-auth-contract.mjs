import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function filesBelow(relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relative = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await filesBelow(relative)));
    } else {
      files.push(relative);
    }
  }

  return files;
}

const authService = await read(
  'apps/web/src/features/auth/services/authService.ts',
);
assert.match(authService, /credentials:\s*"include"/u);
assert.match(authService, /cache:\s*"no-store"/u);
assert.match(authService, /AbortSignal\.timeout\(15_000\)/u);
assert.doesNotMatch(authService, /localStorage|sessionStorage/u);
assert.doesNotMatch(authService, /Authorization\s*:/iu);
assert.doesNotMatch(authService, /Bearer\s+/u);

const authContext = await read('apps/web/src/contexts/AuthContext.tsx');
assert.doesNotMatch(authContext, /localStorage|sessionStorage/u);
assert.doesNotMatch(authContext, /Bearer\s+/u);

for (const actionPage of [
  'apps/web/src/pages/VerifyEmail.tsx',
  'apps/web/src/pages/ResetPassword.tsx',
]) {
  const source = await read(actionPage);
  assert.match(
    source,
    /window\.history\.replaceState\(null,\s*"",\s*window\.location\.pathname\)/u,
    `${actionPage} must scrub one-time action tokens from browser history`,
  );
}

const html = await read('apps/web/index.html');
assert.match(html, /<html lang="es">/u);
assert.match(html, /<meta name="referrer" content="no-referrer"\s*\/>/u);
assert.match(html, /<title>Los Apuntes<\/title>/u);

const authFiles = [
  ...(await filesBelow('apps/web/src/features/auth')),
  'apps/web/src/contexts/AuthContext.tsx',
  'apps/web/src/pages/VerifyEmail.tsx',
  'apps/web/src/pages/ResetPassword.tsx',
  'apps/web/src/pages/Security.tsx',
];

for (const file of authFiles) {
  const source = await read(file);
  assert.doesNotMatch(
    source,
    /\bfakeAuthApi\b/u,
    `${file} must not reintroduce fakeAuthApi`,
  );
  assert.doesNotMatch(
    source,
    /localStorage\.(?:setItem|getItem)\([^)]*(?:token|session)/iu,
    `${file} must not persist auth credentials in localStorage`,
  );
  assert.doesNotMatch(
    source,
    /sessionStorage\.(?:setItem|getItem)\([^)]*(?:token|session)/iu,
    `${file} must not persist auth credentials in sessionStorage`,
  );
}

const signup = await read(
  'apps/web/src/features/auth/signup/SignUpForm.tsx',
);
assert.match(signup, /autoComplete="new-password"/u);

const login = await read(
  'apps/web/src/features/auth/login/LoginForm.tsx',
);
assert.match(login, /autoComplete="current-password"/u);

console.log('PASS Web Auth security contract');
