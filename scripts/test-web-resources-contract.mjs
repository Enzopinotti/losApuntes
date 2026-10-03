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
assert.match(service, /operationKey/u);
assert.match(service, /Podés reintentar sin perder el formulario/u);
assert.match(service, /unsave:\s*\(resourceId/u);
assert.match(service, /saved:\s*\(cursor\?/u);
assert.match(service, /ResourceSearchResponse/u);
assert.match(service, /query\.set\("cursor", cursor\)/u);
assert.match(
  service,
  /function requestSignal\(signal\?: AbortSignal \| null\)/u,
);
assert.match(service, /AbortSignal\.any\(\[signal, timeout\]\)/u);
assert.match(service, /signal: requestSignal\(init\.signal\)/u);
assert.match(service, /text = await response\.text\(\)/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /Authorization\s*:/iu);
assert.doesNotMatch(service, /Bearer\s+/u);
assert.doesNotMatch(service, /withCredentials\s*=\s*true/u);

const page = await read('apps/web/src/pages/Resources.tsx');
assert.match(page, /resourcesApi\.createUploadIntent/u);
assert.match(page, /resourcesApi\.uploadDirect/u);
assert.match(page, /resourcesApi\.finalize/u);
assert.match(page, /resourcesApi\.searchSubjects/u);
assert.match(page, /useAsyncAuthorityFence/u);
assert.equal((page.match(/useAsyncAuthorityFence\(/gu) ?? []).length, 4);
assert.match(page, /user\?\.id/u);
assert.match(page, /session\?\.id/u);
assert.match(page, /queryGeneration/u);
assert.match(page, /if \(!routeQueryIsSynchronized\) return/u);
assert.match(page, /uploadingState\?\.scopeKey === uploadScopeKey/u);
assert.match(page, /uploadProgressState\?\.scopeKey === uploadScopeKey/u);
assert.match(page, /isListRequestCurrent\(ticket\)/u);
assert.match(page, /finishListRequest\(ticket\)/u);
assert.match(page, /isSubjectSearchCurrent\(ticket\)/u);
assert.match(page, /finishSubjectSearch\(ticket\)/u);
assert.match(page, /isUploadCurrent\(ticket\)/u);
assert.match(page, /finishUpload\(ticket\)/u);
assert.match(page, /invalidateUpload\(\)/u);
assert.match(page, /isResourceActionCurrent\(ticket\)/u);
assert.match(page, /finishResourceAction\(ticket\)/u);
assert.match(
  page,
  /handleResourceActionFailure\(\s*ticket,\s*nextError,?\s*\)/u,
);
assert.match(page, /ticket\.signal\.aborted/u);
assert.match(
  page,
  /setUploadProgressState\(\(current\) =>\s*isUploadCurrent\(ticket\)/u,
);
assert.match(page, /uploadOperationKey/u);
assert.match(page, /crypto\.randomUUID\(\)/u);
assert.match(page, /operationKey,\s*ticket\.signal/u);
assert.match(
  page,
  /savedView\s*\?\s*unsave\(resource\)\s*:\s*save\(resource\)/u,
);
assert.match(page, /Quitar de guardados/u);
assert.match(page, /appendResources/u);
assert.match(page, /nextCursor: result\.nextCursor/u);
assert.match(page, /load\(nextCursor, true\)/u);
assert.match(page, /Cargar más/u);
assert.doesNotMatch(page, /let active\s*=/u);
assert.doesNotMatch(page, /objectKey/u);
assert.doesNotMatch(page, /localStorage|sessionStorage/u);

const routes = await read('apps/web/src/app/routes.tsx');
assert.match(
  routes,
  /\{\s*path:\s*"resources",\s*element:\s*<Resources\s*\/>\s*\}/u,
  'Resources discovery route must remain anonymous-readable',
);

console.log('PASS Web Resources privacy/upload contract');
