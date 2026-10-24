import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RISKS = new Map([
  ["braces", { version: "3.0.3", parents: ["micromatch"] }],
  ["node-forge", {
    version: "1.4.0",
    parents: ["@expo/cli", "@expo/code-signing-certificates"],
  }],
  ["zod", { version: "3.25.76", parents: ["@expo/cli"] }],
]);
const IMPORTERS = ["apps/api", "apps/web", "apps/mobile"];

function scalar(line) {
  const match = /^(\s*)(.*?):(?:\s+(.*))?$/u.exec(line);
  if (!match) return null;
  let key = match[2];
  if (key.startsWith("'") && key.endsWith("'")) {
    key = key.slice(1, -1).replaceAll("''", "'");
  } else if (key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  }
  return { indent: match[1].length, key, value: match[3]?.trim() ?? "" };
}

function parseLock(text) {
  assert.equal(typeof text, "string");
  assert.match(text, /^lockfileVersion:\s*'9\.0'$/mu, "pnpm v9 only; re-review on migration");
  assert.doesNotMatch(text, /\t/u, "tabs are not valid in the audited lock graph");
  const snapshots = new Map();
  const importers = new Map();
  const packages = new Set();
  let section = "";
  let item = null;
  let group = null;
  let dependency = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const token = scalar(line);
    if (!token) continue;
    const { indent, key, value } = token;
    if (indent === 0) {
      section = key;
      item = null;
      group = null;
    } else if (indent === 2 && ["snapshots", "importers", "packages"].includes(section)) {
      item = key;
      group = null;
      const map = section === "snapshots" ? snapshots : importers;
      if (section === "packages") packages.add(key);
      else {
        assert.ok(!map.has(key), "duplicate pnpm graph node");
        map.set(key, new Map());
      }
    } else if (indent === 4) {
      group = key;
    } else if (
      indent === 6 &&
      ["dependencies", "optionalDependencies"].includes(group) &&
      ["snapshots", "importers"].includes(section)
    ) {
      dependency = key;
      if (section === "snapshots") {
        assert.ok(value, "unresolved pnpm snapshot edge");
        assert.ok(!snapshots.get(item).has(key), "duplicate pnpm dependency edge");
        snapshots.get(item).set(key, value);
      }
    } else if (
      indent === 8 &&
      key === "version" &&
      ["dependencies", "optionalDependencies"].includes(group) &&
      section === "importers"
    ) {
      assert.ok(value, "missing importer dependency resolution");
      assert.ok(!importers.get(item).has(dependency), "duplicate importer edge");
      importers.get(item).set(dependency, value);
    }
  }
  for (const name of IMPORTERS) {
    assert.ok(importers.has(name), "missing expected production importer: " + name);
    assert.ok(importers.get(name).size > 0, "empty production importer: " + name);
  }
  assert.ok(snapshots.size > 100, "pnpm snapshot graph truncated or invalid");
  for (const [name, risk] of RISKS) {
    assert.ok(packages.has(name + "@" + risk.version), "risk package requires re-review");
    assert.ok(snapshots.has(name + "@" + risk.version), "risk snapshot requires re-review");
  }
  return { snapshots, importers };
}

function packageName(key) {
  const bare = key.split("(")[0];
  const index = bare.lastIndexOf("@");
  assert.ok(index > 0, "invalid package snapshot identity");
  return bare.slice(0, index);
}

function inspectImporter(name, graph) {
  const { snapshots, importers } = graph;
  const seen = new Set();
  const visited = new Set();
  const risks = new Map();
  const todo = [{ importer: name, path: [name] }];

  while (todo.length) {
    const current = todo.pop();
    let edges;
    if (current.importer) {
      if (visited.has(current.importer)) continue;
      visited.add(current.importer);
      edges = importers.get(current.importer);
      assert.ok(edges, "unknown linked workspace importer: " + current.importer);
    } else {
      if (seen.has(current.snapshot)) continue;
      seen.add(current.snapshot);
      edges = snapshots.get(current.snapshot);
      assert.ok(edges, "missing pnpm snapshot: " + current.snapshot);
      const pkg = packageName(current.snapshot);
      if (RISKS.has(pkg)) {
        if (!risks.has(pkg)) risks.set(pkg, current.path);
      }
    }

    for (const [dependency, version] of edges) {
      if (version.startsWith("link:")) {
        const target = path.posix.normalize(
          path.posix.join(current.importer ?? name, version.slice(5)),
        );
        assert.ok(importers.has(target), "unknown workspace link: " + target);
        todo.push({ importer: target, path: [...current.path, target] });
        continue;
      }
      assert.match(version, /^\d+\.\d+\.\d+(?:[-+.\w]*)(?:\(.*\))?$/u,
        "unexpected dependency ref; fail closed for re-review");
      const exact = dependency + "@" + version;
      const bare = dependency + "@" + version.split("(")[0];
      const targets = snapshots.has(exact)
        ? [exact]
        : [...snapshots.keys()].filter((key) => key === bare || key.startsWith(bare + "("));
      assert.ok(targets.length, "missing dependency target: " + bare);
      for (const snapshot of targets) {
        // If peer resolution changes, inspect every compatible snapshot variant.
        todo.push({ snapshot, path: [...current.path, packageName(snapshot)] });
      }
    }
  }
  return { visitedSnapshots: seen.size, risks };
}

/**
 * This is a narrowly scoped graph-containment assertion, NOT an audit waiver.
 * All two existing HIGH vulnerabilities remain real and production-blocking.
 */
export function checkExpoRiskLockBoundary(text) {
  const graph = parseLock(text);
  for (const [key, edges] of graph.snapshots) {
    for (const [dependency] of edges) {
      if (!RISKS.has(dependency)) continue;
      const risk = RISKS.get(dependency);
      const parent = packageName(key);
      assert.ok(risk.parents.includes(parent),
        "unexpected vulnerable package parent: " + parent + " -> " + dependency);
    }
  }

  const api = inspectImporter("apps/api", graph);
  const web = inspectImporter("apps/web", graph);
  const mobile = inspectImporter("apps/mobile", graph);
  assert.equal(api.risks.size, 0, "vulnerable Expo tooling reached API runtime graph");
  assert.equal(web.risks.size, 0, "vulnerable Expo tooling reached Web runtime graph");
  for (const name of RISKS.keys()) {
    assert.ok(mobile.risks.has(name), "known Mobile exposure moved; re-review required");
  }
  return {
    event: "security.expo_transitive_risk.lock_boundary",
    status: "CONFINED_BUT_VULNERABLE",
    apiSnapshotCount: api.visitedSnapshots,
    webSnapshotCount: web.visitedSnapshots,
    mobileSnapshotCount: mobile.visitedSnapshots,
    riskPackages: [...RISKS].map(([name, policy]) => ({
      name,
      observedVersion: policy.version,
      apiReachable: api.risks.has(name),
      webReachable: web.risks.has(name),
      mobileReachable: mobile.risks.has(name),
      expectedDirectParents: policy.parents,
    })),
    productionAuditCertified: false,
    releaseAuthorized: false,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const lock = await readFile(new URL("../../pnpm-lock.yaml", import.meta.url), "utf8");
  console.log(JSON.stringify(checkExpoRiskLockBoundary(lock)));
}
