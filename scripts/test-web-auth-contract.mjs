import {
  readAuthActionToken,
} from '../apps/web/src/features/auth/actionTokenLocation.ts';
import { extractActionToken } from './mailpit-smoke.mjs';
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

assert.equal(
  readAuthActionToken({
    hash: '#token=fragment-authority',
    search: '?token=legacy-authority',
  }),
  'fragment-authority',
);
assert.equal(
  readAuthActionToken({
    hash: '',
    search: '?token=legacy-authority',
  }),
  'legacy-authority',
);
assert.equal(
  readAuthActionToken({
    hash: '#other=value',
    search: '',
  }),
  '',
);

const smokeToken = 'S'.repeat(43);
assert.equal(
  extractActionToken(
    { Text: `https://app.example.test/auth/verify-email#token=${smokeToken}` },
    '/auth/verify-email',
  ),
  smokeToken,
);
assert.equal(
  extractActionToken(
    { Text: `https://app.example.test/auth/verify-email?token=${smokeToken}` },
    '/auth/verify-email',
  ),
  smokeToken,
);

const authService = await read(
  'apps/web/src/features/auth/services/authService.ts',
);
assert.match(authService, /credentials:\s*"include"/u);
assert.match(authService, /cache:\s*"no-store"/u);
assert.match(authService, /AbortSignal\.timeout\(15_000\)/u);
assert.match(authService, /AbortSignal\.any\(\[signal, timeoutSignal\]\)/u);
assert.match(authService, /signal: requestSignal\(init\.signal\)/u);
assert.match(authService, /sessions: \(signal\?: AbortSignal\)/u);
assert.match(authService, /loginMethods: \(signal\?: AbortSignal\)/u);
assert.match(authService, /googleStatus: \(signal\?: AbortSignal\)/u);
assert.match(authService, /revokeAllSessions: \(signal\?: AbortSignal\)/u);
assert.doesNotMatch(authService, /localStorage|sessionStorage/u);
assert.doesNotMatch(authService, /Authorization\s*:/iu);
assert.doesNotMatch(authService, /Bearer\s+/u);

const authContext = await read('apps/web/src/contexts/AuthContext.tsx');
assert.doesNotMatch(authContext, /localStorage|sessionStorage/u);
assert.doesNotMatch(authContext, /Bearer\s+/u);
assert.match(authContext, /visibilitychange/u);
assert.match(authContext, /window\.addEventListener\("focus"/u);
assert.match(authContext, /FOREGROUND_REVALIDATE_AFTER_MS/u);
assert.match(authContext, /refreshInFlightRef/u);
assert.match(authContext, /subscribeAuthAuthorityChanged/u);

const authAuthorityChannel = await read(
  'apps/web/src/features/auth/authAuthorityChannel.ts',
);
assert.match(authAuthorityChannel, /BroadcastChannel/u);
assert.match(authAuthorityChannel, /authority-changed/u);
assert.doesNotMatch(
  authAuthorityChannel,
  /token|cookie|email|sessionId|userId/iu,
  'cross-tab authority hints must not carry secrets or user identifiers',
);

for (const actionPage of [
  'apps/web/src/pages/VerifyEmail.tsx',
  'apps/web/src/pages/ResetPassword.tsx',
]) {
  const source = await read(actionPage);
  assert.match(
    source,
    /scrubAuthActionTokenFromHistory\(\)/u,
    `${actionPage} must scrub one-time action tokens from browser history`,
  );
  assert.match(
    source,
    /readAuthActionToken\(window\.location\)/u,
    `${actionPage} must read fragment-first action authority`,
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

const security = await read('apps/web/src/pages/Security.tsx');
assert.match(security, /useAsyncAuthorityFence/u);
assert.equal((security.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 2);
assert.match(security, /security-load:\$\{authScopeKey\}/u);
assert.match(security, /security-action:\$\{authScopeKey\}/u);
assert.match(security, /snapshotState\?\.scopeKey === authScopeKey/u);
assert.match(security, /draftState\?\.scopeKey === authScopeKey/u);
assert.match(security, /presentationState\?\.scopeKey === authScopeKey/u);
assert.match(security, /authApi\.sessions\(ticket\.signal\)/u);
assert.match(security, /authApi\.revokeAllSessions\(signal\)/u);
assert.doesNotMatch(security, /\blet active\s*=/u);
assert.doesNotMatch(security, /setBusyAction\(|setLoading\(/u);
assert.match(security, /sessionsTruncated/u);
assert.match(security, /sessionInventoryLimit/u);
assert.match(security, /Hay sesiones\s+adicionales que siguen activas/u);
assert.match(security, /Cerrar todas las sesiones/u);

console.log('PASS Web Auth security contract');
