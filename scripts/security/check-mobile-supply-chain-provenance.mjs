import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOTS = Object.freeze(['apps/api', 'apps/web', 'apps/mobile']);
const WATCHED_PACKAGES = new Set(['node-forge', 'braces']);
const MAX_NODES = 20000;
const MAX_DEPTH = 80;
const MAX_LOCK_BYTES = 5_000_000;

function unquote(text) {
  const value = text.trim();
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  return value;
}

function requireMappingKey(value) {
  assert.ok(value && !value.includes('\t'), 'invalid pnpm v9 mapping key');
  return unquote(value);
}

/**
 * Narrow reader for the pnpm v9 lockfile sections needed to walk production
 * dependency edges. No dependency on a globally installed YAML package.
 * Unsupported/missing graph references MUST fail closed, not look absent.
 */
export function readPnpm9ProductionGraph(source) {
  assert.equal(typeof source, 'string', 'pnpm lockfile must be UTF-8 text');
  assert.ok(Buffer.byteLength(source) <= MAX_LOCK_BYTES, 'pnpm lockfile too large');
  assert.match(source, /^lockfileVersion: '9\.0'\r?\n/u, 'only pnpm lockfile v9 is supported');

  const importers = new Map();
  const snapshots = new Map();
  let section = '';
  let importer = '';
  let kind = '';
  let directName = '';
  let snapshot = '';

  for (const rawLine of source.split(/\r?\n/u)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    assert.ok(!rawLine.includes('\t'), 'lockfile indentation contains tabs');
    const mapping = /^( *)([^:\n]+):(?:\s+(.*))?$/u.exec(rawLine);
    if (!mapping) continue; // Only indented key/value mapping edges are relevant.
    const indent = mapping[1].length;
    const key = requireMappingKey(mapping[2]);
    const value = (mapping[3] ?? '').trim();

    if (indent === 0) {
      section = key;
      importer = '';
      snapshot = '';
      kind = '';
      continue;
    }

    if (section === 'importers') {
      if (indent === 2) {
        importer = key;
        assert.ok(!importers.has(importer), 'duplicate importer: ' + importer);
        importers.set(importer, new Map());
        kind = '';
        directName = '';
      } else if (indent === 4) {
        kind = key;
        directName = '';
      } else if (indent === 6) {
        directName = key;
      } else if (indent === 8 && key === 'version' &&
                 (kind === 'dependencies' || kind === 'optionalDependencies')) {
        assert.ok(importer && directName && value, 'invalid importer production edge');
        const entries = importers.get(importer);
        assert.ok(!entries.has(directName), 'duplicate importer package: ' + directName);
        entries.set(directName, unquote(value));
      }
    } else if (section === 'snapshots') {
      if (indent === 2) {
        snapshot = key;
        assert.ok(!snapshots.has(snapshot), 'duplicate snapshot: ' + snapshot);
        snapshots.set(snapshot, new Map());
        kind = '';
      } else if (indent === 4) {
        kind = key;
      } else if (indent === 6 &&
                 (kind === 'dependencies' || kind === 'optionalDependencies')) {
        assert.ok(snapshot && value, 'invalid snapshot production edge');
        const entries = snapshots.get(snapshot);
        assert.ok(!entries.has(key), 'duplicate snapshot dependency: ' + key);
        entries.set(key, unquote(value));
      }
    }
  }
  assert.ok(snapshots.size > 0, 'pnpm snapshot graph missing');
  for (const root of ROOTS) {
    assert.ok(importers.has(root), 'required production importer missing: ' + root);
    assert.ok(importers.get(root).size > 0, 'required production importer empty: ' + root);
  }
  return { importers, snapshots };
}

function packageLabel(snapshot) {
  const withoutPeers = snapshot.split('(')[0];
  const lastAt = withoutPeers.lastIndexOf('@');
  assert.ok(lastAt > 0, 'invalid package snapshot name');
  const name = withoutPeers.slice(0, lastAt);
  const version = withoutPeers.slice(lastAt + 1);
  assert.match(version, /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u, 'invalid package version');
  return { name, version, label: name + '@' + version };
}

function resolveWorkspaceLink(importer, reference, graph) {
  const relative = reference.slice('link:'.length);
  assert.ok(relative && !path.posix.isAbsolute(relative), 'workspace link not relative');
  const dest = path.posix.normalize(path.posix.join(importer, relative));
  assert.ok(dest !== '..' && !dest.startsWith('../'), 'workspace link escapes monorepo');
  assert.ok(graph.importers.has(dest), 'workspace importer not present: ' + dest);
  return dest;
}

function exposureFromRoot(graph, root) {
  const queue = [{ type: 'importer', id: root, chain: [root] }];
  const visited = new Set();
  const exposures = new Map();
  for (let i = 0; i < queue.length; i++) {
    assert.ok(i < MAX_NODES, 'pnpm production graph node limit exceeded');
    const node = queue[i];
    assert.ok(node.chain.length <= MAX_DEPTH, 'pnpm production graph too deep');
    const token = node.type + ':' + node.id;
    if (visited.has(token)) continue;
    visited.add(token);

    const edges = node.type === 'importer'
      ? graph.importers.get(node.id)
      : graph.snapshots.get(node.id);
    assert.ok(edges, 'missing graph node: ' + token);

    for (const [dep, reference] of edges) {
      if (reference.startsWith('link:')) {
        assert.equal(node.type, 'importer', 'unexpected workspace link in snapshot');
        const child = resolveWorkspaceLink(node.id, reference, graph);
        queue.push({ type: 'importer', id: child, chain: [...node.chain, child] });
        continue;
      }
      assert.ok(!reference.startsWith('workspace:') && !reference.startsWith('file:'),
        'unsupported production lockfile reference for ' + dep);
      const snapshot = dep + '@' + reference;
      const info = packageLabel(snapshot);
      const chain = [...node.chain, info.label];
      assert.ok(graph.snapshots.has(snapshot), 'missing production snapshot: ' + snapshot);
      if (WATCHED_PACKAGES.has(info.name) && !exposures.has(info.name)) {
        exposures.set(info.name, { version: info.version, path: chain });
      }
      queue.push({ type: 'snapshot', id: snapshot, chain });
    }
  }
  return { exposures, inspectedNodes: visited.size };
}

/**
 * This is a boundary assertion, never a dependency audit, vulnerability
 * exemption, security sign-off or production release certification.
 */
export function inspectMobileSupplyChainProvenance(graph) {
  const evidence = {};
  for (const root of ROOTS) {
    const { exposures, inspectedNodes } = exposureFromRoot(graph, root);
    evidence[root] = {
      inspectedNodes,
      packages: Object.fromEntries([...exposures.entries()].sort(([a], [b]) =>
        a.localeCompare(b))),
    };
  }
  const serverExposure = [...WATCHED_PACKAGES].filter((name) =>
    evidence['apps/api'].packages[name] || evidence['apps/web'].packages[name]);
  return {
    event: 'security.mobile_supply_chain.provenance',
    boundaryStatus: serverExposure.length ? 'FAIL' : 'ISOLATED_TO_MOBILE',
    serverExposure: serverExposure.sort(),
    importerEvidence: evidence,
    releaseAuthorized: false,
    productionAuditCertified: false,
  };
}

async function main() {
  try {
    assert.equal(process.argv.length, 2, 'usage: node scripts/security/check-mobile-supply-chain-provenance.mjs');
    const source = await readFile('pnpm-lock.yaml', 'utf8');
    const result = inspectMobileSupplyChainProvenance(readPnpm9ProductionGraph(source));
    console.log(JSON.stringify(result));
    if (result.boundaryStatus !== 'ISOLATED_TO_MOBILE') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      event: 'security.mobile_supply_chain.provenance',
      boundaryStatus: 'INVALID_EVIDENCE',
      reason: error instanceof Error ? error.message : 'unknown error',
      releaseAuthorized: false,
      productionAuditCertified: false,
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
