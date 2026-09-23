import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const service = await read(
  'apps/web/src/features/resources/services/resourcesService.ts',
);
assert.match(service, /credentials:\s*"include"/u);
assert.match(service, /cache:\s*"no-store"/u);
assert.match(service, /XMLHttpRequest/u);
assert.match(service, /xhr\.send\(file\)/u);
assert.match(service, /Podés reintentar sin perder el formulario/u);
assert.match(service, /unsave:\s*\(resourceId/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);
assert.doesNotMatch(service, /withCredentials\s*=\s*true/u);

const page = await read('apps/web/src/pages/Resources.tsx');
assert.match(page, /resourcesApi\.createUploadIntent/u);
assert.match(page, /resourcesApi\.uploadDirect/u);
assert.match(page, /resourcesApi\.finalize/u);
assert.match(page, /resourcesApi\.searchSubjects/u);
assert.match(page, /uploadAbort\.current\?\.abort\(\)/u);
assert.match(page, /savedMode\s*\?\s*unsave\(resource\)\s*:\s*save\(resource\)/u);
assert.match(page, /Quitar de guardados/u);
assert.doesNotMatch(page, /objectKey/u);
assert.doesNotMatch(page, /localStorage|sessionStorage/u);

const routes = await read('apps/web/src/app/routes.tsx');
assert.match(
  routes,
  /\{\s*path:\s*"resources",\s*element:\s*<Resources\s*\/>\s*\}/u,
  'Resources discovery route must remain anonymous-readable',
);

console.log('PASS Web Resources privacy/upload contract');
