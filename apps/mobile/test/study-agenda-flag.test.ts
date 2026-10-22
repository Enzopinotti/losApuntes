import assert from "node:assert/strict";
import test from "node:test";

import { studyAgendaVisible } from "../src/features/study/study-agenda-flag";

test("mobile agenda discoverability fails closed", () => {
  assert.equal(studyAgendaVisible(undefined), false);
  assert.equal(studyAgendaVisible("TRUE"), false);
  assert.equal(studyAgendaVisible("false"), false);
  assert.equal(studyAgendaVisible("true"), true);
});
