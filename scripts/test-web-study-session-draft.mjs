import assert from "node:assert/strict";
import {
  rememberStudyDraft, recallStudyDraft, forgetStudyDraft,
  STUDY_DRAFT_TTL_MS,
} from "../apps/web/src/features/study/study-session-draft.mjs";
import { emptyStudySession } from "../apps/web/src/features/study/study-session-plan.mjs";
const a="11111111-1111-4111-8111-111111111111";
const q="22222222-2222-4222-8222-222222222222";
const one="authenticated:alice:session-one:"+a;
const two="authenticated:alice:session-two:"+a;
const foreign="authenticated:bob:session-one:"+a;
const draft={...emptyStudySession(a),title:"",notes:"Intento de parcial",tasks:[
 {kind:"question",id:q,minutes:25,done:true},
]};
const time=1770000000000;
assert.equal(rememberStudyDraft(one,draft,time),true);
const copy=recallStudyDraft(one,a,time+1);
assert.ok(copy);
assert.deepEqual(copy,draft);
copy.notes="Mutated";
assert.equal(recallStudyDraft(one,a,time+1).notes,"Intento de parcial");
assert.equal(recallStudyDraft(two,a,time+1),null);
assert.equal(recallStudyDraft(foreign,a,time+1),null);
assert.equal(recallStudyDraft(one,q,time+1),null);
assert.equal(recallStudyDraft(one,a,time+STUDY_DRAFT_TTL_MS),null);
assert.equal(rememberStudyDraft(one,draft,time),true);
assert.equal(forgetStudyDraft(two),false);
assert.equal(forgetStudyDraft(one),true);
assert.equal(recallStudyDraft(one,a,time+1),null);
assert.equal(rememberStudyDraft(one,{...draft,title:"x".repeat(101)},time),false);
assert.equal(rememberStudyDraft(one,{...draft,privateUrl:"token"},time),false);
assert.equal(rememberStudyDraft("other",draft,time),false);
console.log("Study draft memory contract PASS");
