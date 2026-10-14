import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Browser E2E changes session fixtures and briefly pauses the Mongo TTL monitor.
 * Reject remote Docker contexts and any Mongo container that is not the
 * ephemeral tmpfs-backed service of THIS repository's compose.local.yml.
 */
export function assertDisposableComposeMongo({
  contextHost,
  dockerHostOverride,
  composeConfigFiles,
  tmpfs,
  root,
}) {
  const isLocalTransport = (value) =>
    typeof value === "string" &&
    (value.startsWith("unix:///") || value.startsWith("npipe:////"));

  assert.ok(isLocalTransport(contextHost), "Auth smoke requires a local Docker context");
  if (dockerHostOverride) {
    assert.ok(
      isLocalTransport(dockerHostOverride),
      "Auth smoke refuses remote DOCKER_HOST endpoints",
    );
  }
  const normalize = (value) => resolve(value).replaceAll("\\", "/").toLowerCase();
  const expected = normalize(resolve(root, "compose.local.yml"));
  assert.ok(
    typeof composeConfigFiles === "string" &&
      composeConfigFiles.split(",").map((file) => normalize(file.trim())).includes(expected),
    "Auth smoke requires this repository's disposable compose.local.yml",
  );
  assert.ok(
    tmpfs !== null &&
      typeof tmpfs === "object" &&
      !Array.isArray(tmpfs) &&
      Object.hasOwn(tmpfs, "/data/db"),
    "Auth smoke requires tmpfs-backed Mongo /data/db, not persistent volumes",
  );
}

function docker(root, args) {
  return execFileSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 64 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/**
 * Read-only Docker inspection, called BEFORE the smoke creates user accounts
 * or modifies Mongo's global TTL monitor.
 */
export function assertLocalAuthSmokeMongo(root) {
  const contextHost = JSON.parse(
    docker(root, ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]),
  );
  const id = docker(root, [
    "compose", "-f", "compose.local.yml", "ps", "-q", "mongo",
  ]);
  assert.ok(id && /^[0-9a-f]{12,64}$/iu.test(id), "Local Compose Mongo must be running");
  const labels = JSON.parse(
    docker(root, ["inspect", "--format", "{{json .Config.Labels}}", id]),
  );
  const tmpfs = JSON.parse(
    docker(root, ["inspect", "--format", "{{json .HostConfig.Tmpfs}}", id]),
  );
  assertDisposableComposeMongo({
    contextHost,
    dockerHostOverride: process.env.DOCKER_HOST,
    composeConfigFiles: labels?.["com.docker.compose.project.config_files"],
    tmpfs,
    root,
  });
}
