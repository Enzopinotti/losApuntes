import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const file = (path) => readFileSync(new URL(path, root), "utf8");

const controller = file("apps/api/src/study-progress/study-progress.controller.ts");
const service = file("apps/api/src/study-progress/study-progress.service.ts");
const validator = file("apps/api/src/study-progress/domain/study-progress.plan.ts");
const schema = file("apps/api/src/study-progress/mongo/study-progress.schema.ts");
const apiModule = file("apps/api/src/app.module.ts");
const config = file("apps/api/src/config/runtime-environment.ts");
const lifecycle = file("apps/api/src/data-lifecycle/mongo/mongo-account-lifecycle.store.ts");
const lifecycleModule = file("apps/api/src/data-lifecycle/data-lifecycle.module.ts");
const web = file("apps/web/src/pages/StudyRunner.tsx");
const client = file("apps/web/src/features/study/studyProgressApi.ts");
const flag = file("apps/web/src/features/study/studyProgressFlags.ts");
let checks = 0;
const verify = (name, f) => { f(); checks++; console.log("PASS", name); };
verify("all endpoints use auth plus disabled-by-default feature guard", () => {
  assert.match(controller, /@UseGuards\(AuthSessionGuard, StudyProgressFeatureGuard\)/u);
  assert.match(controller, /@Header\('Cache-Control', 'private, no-store'\)/u);
  assert.match(controller, /@Get\(':subjectId'\)/u);
  assert.match(controller, /@Put\(':subjectId'\)/u);
  assert.match(controller, /@Delete\(':subjectId'\)/u);
});
verify("owner IDs come exclusively from authentication", () => {
  assert.match(controller, /req\.user\.id, subjectId/u);
  assert.doesNotMatch(controller, /@Body\(\).*ownerUserId/u);
});
verify("strict server plan validator and bounded copy", () => {
  assert.match(service, /parseStudyProgressPlan\(rawPlan, subject\)/u);
  assert.match(validator, /value\.tasks\.length > 24/u);
  assert.match(validator, /total > 1200/u);
  assert.match(validator, /Buffer\.byteLength/u);
  assert.match(validator, /keys\(task, \['kind', 'id', 'minutes', 'done'\]\)/u);
});
verify("unique per-owner per-subject document and CAS", () => {
  assert.match(schema, /ownerUserId: 1, subjectId: 1.*unique: true/u);
  assert.match(service, /revision: expectedRevision/u);
  assert.match(service, /\$inc: \{ revision: 1 \}/u);
  assert.match(service, /expectedRevision === 0/u);
  assert.match(service, /duplicate\(error\)/u);
  assert.match(service, /slots >= 16/u);
  assert.match(service, /STUDY_PROGRESS_LIMIT_REACHED/u);
  assert.match(service, /STUDY_PROGRESS_REVISION_CONFLICT/u);
});
verify("closed accounts cannot mutate progress and closure purges it", () => {
  assert.match(service, /account_lifecycle_revision: 1/u);
  assert.match(service, /account_status: 'active'/u);
  assert.match(lifecycle, /this\.studyProgress\s*\.deleteMany\(\{ ownerUserId: input\.userId \}, \{ session \}\)/u);
  assert.match(lifecycleModule, /StudyProgressSchema/u);
});
verify("new API module and feature flag default to false", () => {
  assert.match(apiModule, /StudyProgressModule/u);
  assert.match(config, /STUDY_PROGRESS_ENABLED: parseBoolean\(/u);
  assert.match(flag, /=== "true"/u);
});
verify("web credentials, timeouts and no-cache requests", () => {
  assert.match(client, /credentials: "include"/u);
  assert.match(client, /cache: "no-store"/u);
  assert.match(client, /AbortSignal\.timeout\(15_000\)/u);
  assert.match(client, /normalizeStudySession\(raw\.plan\)/u);
});
verify("UI supports manual save, remote retrieval and deletion", () => {
  assert.match(web, /Consultar mi guardado/u);
  assert.match(web, /Guardar sesión en mi cuenta/u);
  assert.match(web, /Recuperar sesión guardada/u);
  assert.match(web, /Eliminar guardado de mi cuenta/u);
  assert.match(web, /remoteSnapshot\?\.scope === scope/u);
  assert.match(web, /remoteCurrent\(ticket\)/u);
});
verify("409 keeps local work, does not silently overwrite", () => {
  assert.match(web, /error\.status === 409/u);
  assert.match(web, /setRemoteSnapshot\(null\)/u);
  assert.match(web, /window\.confirm\(/u);
  // The current UI re-fetches the saved revision before replacing local
  // work; assert that stronger guarantee rather than the old raw snapshot.
  assert.match(web, /const latest = await studyProgressApi\.get\(subjectId, ticket\.signal\)/u);
  assert.match(web, /latest\.revision !== remote\.revision/u);
  assert.match(web, /await loadPlan\(latest\.plan\)/u);
});
verify("no new local client-side persistent data or grants", () => {
  assert.doesNotMatch(client + web, /localStorage|sessionStorage|indexedDB/u);
  assert.doesNotMatch(schema, /accessUrl|signedUrl|credential|token/u);
});
console.log("PASS " + checks + " B61 static integration scenarios");
