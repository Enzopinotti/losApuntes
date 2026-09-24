import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const service = await read(
  'apps/web/src/features/academic/services/academicService.ts',
);
assert.match(service, /\/academic\/me\/lifecycle/u);
assert.match(service, /\/graduate/u);
assert.match(service, /\/roles/u);
assert.match(service, /\/academic\/me\/follows/u);
assert.match(service, /credentials:\s*"include"/u);
assert.match(service, /cache:\s*"no-store"/u);
assert.doesNotMatch(service, /localStorage|sessionStorage/u);
assert.doesNotMatch(service, /isGraduated/u);

const lifecycle = await read('apps/web/src/pages/AcademicLifecycle.tsx');
assert.match(lifecycle, /academicApi\.lifecycle\(\)/u);
assert.match(lifecycle, /academicApi\.graduate\(/u);
assert.match(lifecycle, /academicApi\.updateRoles\(/u);
assert.match(lifecycle, /academicApi\.follow\(/u);
assert.match(lifecycle, /academicApi\.unfollow\(/u);
assert.match(lifecycle, /Conserva todo el historial/u);
assert.doesNotMatch(lifecycle, /isGraduated/u);
assert.doesNotMatch(lifecycle, /localStorage|sessionStorage/u);

const home = await read('apps/web/src/pages/Home.tsx');
assert.match(home, /snapshot\.lifecycle\.phase/u);
assert.match(home, /snapshot\.academic\.currentSubjectIds\.length\s*===\s*0/u);
assert.match(home, /snapshot\.homeFeed\.kind\s*===\s*"community"/u);
assert.match(home, /Universidad y comunidad/u);
assert.match(home, /Tu etapa cambió, tu comunidad sigue/u);
assert.doesNotMatch(home, /isGraduated/u);

const routes = await read('apps/web/src/app/routes.tsx');
assert.match(routes, /path:\s*"academic\/lifecycle"/u);
assert.match(
  routes,
  /path:\s*"academic\/lifecycle"[\s\S]*?<PrivateRoute>[\s\S]*?<AcademicLifecycle\s*\/>[\s\S]*?<\/PrivateRoute>/u,
);

console.log('PASS Web Alumni lifecycle contract');
