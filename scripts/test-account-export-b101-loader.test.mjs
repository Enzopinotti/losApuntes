import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyB101SignedHttpTap as verify } from './testing/b101-signed-http-tap.mjs';
import { resolve } from './testing/resolve-api-typescript.mjs';

const titles = Array.from({ length: 22 }, (_, i) => 'B101 scenario ' + (i + 1));
const valid = names => [
  'TAP version 13',
  ...names.flatMap((name, index) => [
    '# Subtest: ' + name,
    'ok ' + (index + 1) + ' - ' + name,
  ]),
  '1..' + names.length,
  '# tests ' + names.length, '# suites 0', '# pass ' + names.length,
  '# fail 0', '# cancelled 0', '# skipped 0', '# todo 0',
].join('\n') + '\n';

test('B101 validates all 22 distinct executed PASS results', () => {
  assert.deepEqual(verify({ stdout: valid(titles), exitCode: 0, expectedNames: titles }),
    { passed: 22, expected: 22 });
});

test('B101 rejects omitted and skipped tests despite green exit status', () => {
  for (const tap of [
    valid(titles.slice(0, -1)),
    valid(titles).replace('# skipped 0', '# skipped 1'),
    valid(titles).replace('# pass 22', '# pass 21'),
    valid(titles).replace('ok 3 -', 'not ok 3 -'),
    valid(titles).replace('# Subtest: B101 scenario 2', '# Subtest: B101 scenario 1'),
    valid(titles).replace('# fail 0', '# fail 1'),
  ]) {
    assert.throws(() => verify({ stdout: tap, exitCode: 0, expectedNames: titles }));
  }
});

test('B101 rejects duplicate expected names and nonzero child exits', () => {
  assert.throws(() => verify({ stdout: valid(titles), exitCode: 1, expectedNames: titles }));
  assert.throws(() => verify({
    stdout: valid(titles), exitCode: 0, expectedNames: titles.map(() => 'same'),
  }));
});

test('B101 resolver maps only existing extensionless relative API imports', async () => {
  const parentURL = new URL('../apps/api/src/files/storage/s3-object-storage.ts', import.meta.url).href;
  const next = async specifier => ({ url: specifier });
  const resolved = await resolve('./s3-multipart-completion',
    { parentURL }, next);
  assert.equal(resolved.url,
    new URL('../apps/api/src/files/storage/s3-multipart-completion.ts', import.meta.url).href);
  const body = await resolve('./s3-multipart-response-body', { parentURL }, next);
  assert.ok(body.url.endsWith('/s3-multipart-response-body.ts'));
});

test('B101 resolver never hijacks packages, explicit extensions or outside paths', async () => {
  const parentURL = new URL('../apps/api/src/files/storage/s3-object-storage.ts', import.meta.url).href;
  const next = async specifier => ({ url: specifier });
  for (const specifier of ['node:crypto', 'some-package', './x.js', '../../../../../secrets',
    './missing-extensionless', './some?query']) {
    assert.deepEqual(await resolve(specifier, { parentURL }, next), { url: specifier });
  }
  assert.deepEqual(await resolve('./s3-multipart-completion',
    { parentURL: new URL('./test-account-export-b101-loader.test.mjs', import.meta.url).href },
    next), { url: './s3-multipart-completion' });
});
