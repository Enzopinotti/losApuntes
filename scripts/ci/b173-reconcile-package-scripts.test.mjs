import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reconcilePackageScripts } from "./b173-reconcile-package-scripts.mjs";

const base = {
  name: "los-apuntes",
  version: "0.0.0",
  scripts: {
    test: Array.from({ length: 20 }, (_, i) => "pnpm test:baseline-" + i).join(" && "),
    build: "pnpm -r build",
    "audit:prod": "pnpm audit --prod --audit-level high",
  },
  dependencies: { axios: "1.20.0" },
};
const baseline = JSON.stringify(base);
function newSource(pr, script, slot = 7) {
  const copy = structuredClone(base);
  const commands = base.scripts.test.split(" && ");
  commands.splice(slot, 0, "pnpm " + script);
  copy.scripts.test = commands.join(" && ");
  copy.scripts[script] = "node --test scripts/" + script + ".mjs";
  return { pr, newTestScript: script, text: JSON.stringify(copy) };
}

test("B173 preserves baseline order while adding all three independent tests", () => {
  const sources = [
    newSource(503, "test:web-resource-citation-b170", 9),
    newSource(487, "test:web-dashboard-b158", 7),
    newSource(501, "test:web-study-focus-clock-b169", 7),
  ];
  const result = reconcilePackageScripts(baseline, sources);
  const parsed = JSON.parse(result.text);
  assert.equal(parsed.scripts.build, base.scripts.build);
  assert.equal(parsed.scripts["audit:prod"], base.scripts["audit:prod"]);
  assert.deepEqual(Object.keys(parsed.dependencies), ["axios"]);
  assert.equal(result.testCommandCount, 23);
  assert.equal(parsed.scripts.test.split(" && ")[7], "pnpm test:web-dashboard-b158");
  assert.equal(parsed.scripts.test.split(" && ")[8], "pnpm test:web-study-focus-clock-b169");
  assert.equal(parsed.scripts.test.split(" && ")[11], "pnpm test:web-resource-citation-b170");
  assert.deepEqual(result.addedScripts, [
    "test:web-dashboard-b158",
    "test:web-resource-citation-b170",
    "test:web-study-focus-clock-b169",
  ]);
});

test("B173 output is deterministic regardless of candidate input order", () => {
  const a = newSource(487, "test:web-dashboard-b158");
  const b = newSource(503, "test:web-resource-citation-b170");
  assert.equal(reconcilePackageScripts(baseline, [a, b]).text,
    reconcilePackageScripts(baseline, [b, a]).text);
});

test("B173 rejects removal of a baseline verification", () => {
  const source = newSource(487, "test:web-dashboard-b158");
  const doc = JSON.parse(source.text);
  doc.scripts.test = doc.scripts.test.replace("pnpm test:baseline-10 && ", "");
  source.text = JSON.stringify(doc);
  assert.throws(() => reconcilePackageScripts(baseline, [source]), /removed|reordered/iu);
});

test("B173 rejects changed audit, dependency and root manifest fields", () => {
  for (const change of [
    (x) => { x.scripts["audit:prod"] = "echo PASS"; },
    (x) => { x.dependencies.axios = "0.0.0"; },
    (x) => { x.version = "2.0.0"; },
    (x) => { x.scripts.test += " && echo PASS"; },
    (x) => { x.scripts["test:unsafe"] = "true"; },
  ]) {
    const source = newSource(487, "test:web-dashboard-b158");
    const doc = JSON.parse(source.text);
    change(doc);
    source.text = JSON.stringify(doc);
    assert.throws(() => reconcilePackageScripts(baseline, [source]));
  }
});

test("B173 rejects script collisions, duplicate PRs and extra test invocations", () => {
  const a = newSource(487, "test:web-dashboard-b158");
  const b = newSource(501, "test:web-study-focus-clock-b169");
  assert.throws(() => reconcilePackageScripts(baseline, [a, a]), /duplicate PR/iu);
  assert.throws(() => reconcilePackageScripts(baseline, [a, {...a, pr: 503}]),
    /duplicate new test script/iu);
  const other = JSON.parse(b.text);
  other.scripts.test += " && pnpm test:old-special";
  assert.throws(() => reconcilePackageScripts(baseline, [a, {
    ...b,
    text: JSON.stringify(other),
  }]), /unexpected test invocation/iu);
});

test("B173 real repo baseline retains strict high severity production audit", async () => {
  const json = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(json.scripts["audit:prod"], "pnpm audit --prod --audit-level high");
  const manifest = JSON.parse(await readFile("scripts/ci/b173-candidates.json", "utf8"));
  assert.equal(manifest.candidates.length, 6);
  assert.equal(manifest.candidates.filter(c => c.newTestScript).length, 3);
  assert.equal(new Set(manifest.candidates.map(c => c.pr)).size, 6);
  for (const c of manifest.candidates) {
    assert.match(c.sha, /^[a-f0-9]{40}$/u);
    assert.match(c.branch, /^[a-z0-9][a-z0-9/_-]+$/u);
  }
});
