import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { assertDisposableComposeMongo } from "./auth-local-compose-guard.mjs";

const root = resolve("/workspace/losApuntes");
const good = {
  contextHost: "unix:///var/run/docker.sock",
  dockerHostOverride: undefined,
  composeConfigFiles: resolve(root, "compose.local.yml"),
  tmpfs: { "/data/db": "" },
  root,
};

test("only exact repo Compose Mongo on tmpfs and local socket passes", () => {
  assert.doesNotThrow(() => assertDisposableComposeMongo(good));
  assert.doesNotThrow(() => assertDisposableComposeMongo({
    ...good,
    contextHost: "npipe:////./pipe/docker_engine",
    dockerHostOverride: "npipe:////./pipe/docker_engine",
  }));
  assert.doesNotThrow(() => assertDisposableComposeMongo({
    ...good,
    composeConfigFiles: `${root}/irrelevant.yml,${root}/compose.local.yml`,
  }));
});

test("rejects remote Docker contexts including SSH and TCP endpoints", () => {
  for (const contextHost of [
    "ssh://deploy@example.com",
    "tcp://192.0.2.4:2376",
    "http://127.0.0.1:2375",
    "",
    undefined,
  ]) {
    assert.throws(
      () => assertDisposableComposeMongo({ ...good, contextHost }),
      /local Docker context/u,
    );
  }
});

test("rejects DOCKER_HOST overrides even when active context appears local", () => {
  for (const dockerHostOverride of [
    "ssh://prod",
    "tcp://localhost:2375",
    "tcp://10.0.0.2:2376",
  ]) {
    assert.throws(
      () => assertDisposableComposeMongo({ ...good, dockerHostOverride }),
      /remote DOCKER_HOST/u,
    );
  }
});

test("refuses a Mongo container not owned by this exact Compose file", () => {
  for (const composeConfigFiles of [
    undefined,
    null,
    "",
    "/srv/production/compose.yml",
    "/srv/production/compose.local.yml",
    resolve(root, "compose.prod.yml"),
  ]) {
    assert.throws(
      () => assertDisposableComposeMongo({ ...good, composeConfigFiles }),
      /disposable compose.local.yml/u,
    );
  }
});

test("refuses persistent Mongo mounts and absent tmpfs even on local Docker", () => {
  for (const tmpfs of [
    undefined,
    null,
    {},
    { "/other/path": "" },
    [{ Destination: "/data/db", Type: "volume" }],
  ]) {
    assert.throws(
      () => assertDisposableComposeMongo({ ...good, tmpfs }),
      /tmpfs-backed Mongo/u,
    );
  }
});

test("browser smoke inspects the disposable Mongo before requests and TTL mutation", () => {
  const script = readFileSync(new URL("./auth-browser-e2e.mjs", import.meta.url), "utf8");
  const guard = readFileSync(new URL("./auth-local-compose-guard.mjs", import.meta.url), "utf8");
  assert.match(script, /assertLocalAuthSmokeMongo\(ROOT\);/u);
  assert.ok(script.indexOf("assertLocalAuthSmokeMongo(ROOT)") < script.indexOf('const health = await fetch('));
  assert.match(guard, /"compose", "-f", "compose.local.yml", "ps", "-q", "mongo"/u);
  assert.match(guard, /\.HostConfig\.Tmpfs/u);
  assert.match(guard, /com\.docker\.compose\.project\.config_files/u);
  assert.doesNotMatch(guard, /setParameter|updateOne|deleteMany|mongorestore/iu);
});
