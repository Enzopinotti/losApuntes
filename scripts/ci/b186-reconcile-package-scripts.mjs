import assert from "node:assert/strict";

/**
 * The only allowed B186 conflict reconciliation is root package.json's
 * additional Web tests. Everything else is fail-closed: no dependency,
 * script rewrite, skip, removal, or audit bypass may be auto-resolved.
 */
export function reconcilePackageScripts(baseText, sources) {
  assert.equal(typeof baseText, "string");
  assert.ok(Array.isArray(sources) && sources.length > 0);
  const base = JSON.parse(baseText);
  assert.ok(base && typeof base === "object" && base.scripts);
  assert.equal(typeof base.scripts.test, "string");

  const originalCommands = base.scripts.test.split(" && ");
  assert.ok(originalCommands.length > 15, "unexpected test command layout");
  assert.equal(new Set(originalCommands).size, originalCommands.length,
    "duplicate baseline commands are unsupported");

  const additions = [];
  const scriptsToAdd = new Map();
  const sourceNumbers = new Set();

  for (const source of [...sources].sort((a, b) => a.pr - b.pr)) {
    assert.ok(Number.isSafeInteger(source.pr) && source.pr > 0);
    assert.ok(!sourceNumbers.has(source.pr), "duplicate PR cannot be reconciled");
    sourceNumbers.add(source.pr);
    assert.match(source.newTestScript, /^test:web-[a-z0-9-]+$/u);
    assert.equal(typeof source.text, "string");
    const candidate = JSON.parse(source.text);
    const { scripts: sourceScripts, ...otherSource } = candidate;
    const { scripts: baseScripts, ...otherBase } = base;
    assert.deepEqual(otherSource, otherBase,
      "PR " + source.pr + " modifies package metadata beyond scripts");
    assert.ok(sourceScripts && typeof sourceScripts === "object");

    const insertedKeys = Object.keys(sourceScripts).filter(
      (key) => !Object.hasOwn(baseScripts, key),
    );
    assert.deepEqual(insertedKeys, [source.newTestScript],
      "PR " + source.pr + " adds unexpected scripts");

    for (const [key, value] of Object.entries(baseScripts)) {
      if (key === "test") continue;
      assert.equal(sourceScripts[key], value,
        "PR " + source.pr + " changed an existing script: " + key);
    }
    const expectedInvocation = "pnpm " + source.newTestScript;
    const newInvocation = sourceScripts.test.split(" && ");
    const newCommands = [];
    let cursor = 0;

    for (const command of newInvocation) {
      if (command === originalCommands[cursor]) {
        cursor++;
      } else {
        newCommands.push({ command, slot: cursor });
      }
    }
    assert.equal(cursor, originalCommands.length,
      "PR " + source.pr + " removed or reordered an existing test");
    assert.deepEqual(newCommands.map((x) => x.command), [expectedInvocation],
      "PR " + source.pr + " introduced an unexpected test invocation");

    const scriptBody = sourceScripts[source.newTestScript];
    assert.equal(typeof scriptBody, "string");
    assert.ok(scriptBody.startsWith("node "),
      "PR " + source.pr + " new command must run Node");
    assert.ok(!scriptsToAdd.has(source.newTestScript),
      "duplicate new test script");
    scriptsToAdd.set(source.newTestScript, scriptBody);
    additions.push({ ...newCommands[0], pr: source.pr });
  }

  const output = [];
  for (let slot = 0; slot <= originalCommands.length; slot++) {
    // Prefer deterministic PR numeric order if two tests share an insertion slot.
    for (const entry of additions
      .filter((candidate) => candidate.slot === slot)
      .sort((a, b) => a.pr - b.pr)) {
      output.push(entry.command);
    }
    if (slot < originalCommands.length) output.push(originalCommands[slot]);
  }

  assert.equal(new Set(output).size, output.length,
    "reconciliation introduced duplicate commands");
  const result = structuredClone(base);
  result.scripts.test = output.join(" && ");
  for (const [name, script] of scriptsToAdd) {
    assert.ok(!Object.hasOwn(result.scripts, name));
    result.scripts[name] = script;
  }
  return {
    text: JSON.stringify(result, null, 2) + "\n",
    addedScripts: [...scriptsToAdd.keys()].sort(),
    testCommandCount: output.length,
  };
}
