import assert from "node:assert/strict";
import {
  addStudyKitResource,
  changeStudyKit,
  createStudyKit,
  deleteStudyKit,
  emptyStudyKitArchive,
  moveStudyKitResource,
  normalizeStudyKitArchive,
  readStudyKitArchive,
  removeStudyKitResource,
  serializeStudyKitArchive,
  studyKitToSession,
  STUDY_KIT_MAX_COLLECTIONS,
  STUDY_KIT_MAX_RESOURCES,
} from "../apps/web/src/features/study/study-portable-kits.mjs";
import {
  saveStudyKitWorkspace,
  loadStudyKitWorkspace,
  forgetStudyKitWorkspace,
} from "../apps/web/src/features/study/study-kit-workspace.mjs";
import { readStudySession, serializeStudySession } from "../apps/web/src/features/study/study-session-plan.mjs";
const subject = "11111111-1111-4111-8111-111111111111";
const foreign = "22222222-2222-4222-8222-222222222222";
const kitId = "33333333-3333-4333-8333-333333333333";
const item1 = "44444444-4444-4444-8444-444444444444";
const item2 = "55555555-5555-4555-8555-555555555555";
const empty=emptyStudyKitArchive(subject);
const created=createStudyKit(empty,{id:kitId,title:"  Primer  parcial  ",notes:"Unidad 1"});
assert.equal(created.kits[0].title,"Primer parcial");
const added=addStudyKitResource(addStudyKitResource(created,kitId,item1),kitId,item2);
assert.deepEqual(added.kits[0].resourceIds,[item1,item2]);
assert.deepEqual(addStudyKitResource(added,kitId,item1),added);
assert.deepEqual(moveStudyKitResource(added,kitId,1,-1).kits[0].resourceIds,[item2,item1]);
assert.equal(removeStudyKitResource(added,kitId,item1).kits[0].resourceIds.length,1);
assert.equal(changeStudyKit(added,kitId,{title:"Segundo parcial"}).kits[0].title,"Segundo parcial");
assert.equal(deleteStudyKit(added,kitId).kits.length,0);
assert.deepEqual(readStudyKitArchive(serializeStudyKitArchive(added)),added);
const plan=studyKitToSession(added,kitId);
assert.equal(plan.tasks.length,2);
assert.ok(plan.tasks.every((task)=>task.kind==="resource"&&task.minutes===20));
assert.deepEqual(readStudySession(serializeStudySession(plan)),plan);
const exported=serializeStudyKitArchive(added);
assert.ok(!exported.includes("signedUrl"));
assert.ok(!exported.includes("fileName"));
assert.ok(!exported.includes("author"));
assert.throws(()=>readStudyKitArchive("not json"));
assert.throws(()=>readStudyKitArchive("a".repeat(65537)));
assert.throws(()=>normalizeStudyKitArchive({...added,version:2}));
assert.throws(()=>normalizeStudyKitArchive({...added,sessions:[]}));
assert.throws(()=>normalizeStudyKitArchive({...added,subjectId:"wrong"}));
assert.throws(()=>normalizeStudyKitArchive({...added,kits:[added.kits[0],added.kits[0]]}));
assert.throws(()=>normalizeStudyKitArchive({...added,kits:[{
 ...added.kits[0],resourceIds:[item1,item1.toUpperCase()],
}]}));
assert.throws(()=>normalizeStudyKitArchive({...added,kits:[{
 ...added.kits[0],title:" ",
}]}));
assert.throws(()=>normalizeStudyKitArchive({...added,kits:[{
 ...added.kits[0],resourceIds:Array.from(
  {length:STUDY_KIT_MAX_RESOURCES+1},(_,index)=>
   `000000${String(index).padStart(2,"0")}-0000-4000-8000-000000000000`,
 ),
}]}));
assert.throws(()=>normalizeStudyKitArchive({...added,kits:Array.from(
 {length:STUDY_KIT_MAX_COLLECTIONS+1},(_,index)=>({
  id:`000000${String(index).padStart(2,"0")}-0000-4000-8000-000000000000`,
  title:"Test",notes:"",resourceIds:[],
 }),
)}));
assert.throws(()=>studyKitToSession(empty,kitId));
assert.throws(()=>studyKitToSession(created,kitId));
assert.throws(()=>moveStudyKitResource(added,kitId,0,-1));
const scope=`authenticated:user-1:session-1:${subject}`;
assert.equal(saveStudyKitWorkspace(scope,added,100),true);
assert.deepEqual(loadStudyKitWorkspace(scope,101),added);
assert.equal(loadStudyKitWorkspace(`authenticated:user-2:session-1:${subject}`,101),null);
assert.equal(loadStudyKitWorkspace(`authenticated:user-1:session-2:${subject}`,101),null);
assert.equal(forgetStudyKitWorkspace(scope),true);
assert.equal(loadStudyKitWorkspace(scope,101),null);
console.log("Portable study kits pure contracts PASS");
