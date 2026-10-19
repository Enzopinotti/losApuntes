import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) =>
  readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const progress = read('apps/api/src/study-progress/study-progress.module.ts');
const progressController = read(
  'apps/api/src/study-progress/study-progress.controller.ts',
);
const collections = read('apps/api/src/study-collections/study-collections.module.ts');
const collectionsController = read('apps/api/src/study-collections/study-collections.controller.ts');
const users = read('apps/api/src/users/users.module.ts');
const auth = read('apps/api/src/auth/auth.module.ts');
const guard = read('apps/api/src/auth/guards/auth-session.guard.ts');
const env = read('apps/api/src/config/runtime-environment.ts');

test('StudyProgress imports the UsersModule provider scope alongside AuthModule', () => {
  assert.match(
    progress,
    /import \{ UsersModule \} from '\.\.\/users\/users\.module';/u,
  );
  assert.match(
    progress,
    /imports: \[\s*AuthModule,\s*UsersModule,\s*MongooseModule\.forFeature/u,
  );
  assert.match(users, /providers: \[UsersService\]/u);
  assert.match(users, /exports: \[UsersService\]/u);
  assert.match(auth, /imports: \[\s*UsersModule,/u);
  // AuthSessionGuard is shared across feature controllers. Consumers must
  // resolve its user service transitively through AuthModule's public scope.
  assert.match(auth, /exports: \[\s*UsersModule,/u);
  assert.match(collections, /imports: \[\s*AuthModule,/u);
  assert.match(
    collectionsController,
    /@UseGuards\(AuthSessionGuard, StudyCollectionsFeatureGuard\)/u,
  );
});

test('the authenticated Study Progress controller retains its owner guard', () => {
  assert.match(
    progressController,
    /@UseGuards\(AuthSessionGuard, StudyProgressFeatureGuard\)/u,
  );
  assert.match(guard, /private readonly users: UsersService/u);
  assert.match(guard, /private readonly sessions: AuthSessionService/u);
  assert.match(guard, /private readonly config: ConfigService/u);
});

test('Study Progress remains production disabled regardless of module wiring', () => {
  assert.match(
    env,
    /STUDY_PROGRESS_ENABLED must remain false in production/u,
  );
  assert.match(
    progress,
    /providers: \[StudyProgressService, StudyProgressFeatureGuard\]/u,
  );
});
