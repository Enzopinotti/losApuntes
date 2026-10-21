import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { reconcilePackageScripts } from "./b173-reconcile-package-scripts.mjs";

const manifest = JSON.parse(readFileSync("scripts/ci/b173-candidates.json", "utf8"));
const candidateDirectory = resolve(process.env.RUNNER_TEMP || "/tmp", "b173-composed-worktree");
const shaPattern = /^[0-9a-f]{40}$/u;

function git(args, cwd = process.cwd()) {
  return execFileSync("git", args, {
    cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
  }).trim();
}
function fail(reason, details = {}) {
  console.error(JSON.stringify({ event: "ci.b173.rehearsal", status: "FAIL",
    reason, ...details, releaseAuthorized: false, deployed: false }));
  process.exitCode = 1;
}

export function assertManifest(contract) {
  assert.equal(contract.version, 1);
  assert.match(contract.baseSha, shaPattern);
  assert.equal(contract.candidates.length, 6);
  assert.deepEqual(contract.candidates.map(x => x.pr),
    [484, 495, 487, 493, 501, 503], "unreviewed candidate added or order changed");
  for (const x of contract.candidates) {
    assert.match(x.branch, /^[a-z0-9]+(?:\/[a-z0-9_-]+)+$/u);
    assert.match(x.sha, shaPattern);
    if (Object.hasOwn(x, "newTestScript")) {
      assert.match(x.newTestScript, /^test:web-[a-z0-9-]+$/u);
    }
  }
  assert.deepEqual(
    contract.candidates.filter(x => x.newTestScript).map(x => x.pr),
    [487, 501, 503],
  );
}

async function main() {
  assert.equal(process.argv.length, 2, "No runtime arguments are supported");
  assertManifest(manifest);
  const originalHead = git(["rev-parse", "HEAD"]);
  const originalDirty = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  assert.equal(originalDirty, "", "Rehearsal checkout must be clean");
  assert.equal(git(["ls-remote", "origin", "refs/heads/main"]).split(/\s+/u)[0],
    manifest.baseSha, "Main moved since manifest approval — repin and review");
  assert.equal(git(["merge-base", originalHead, manifest.baseSha]),
    manifest.baseSha, "Rehearsal branch is not based on approved main");

  for (const candidate of manifest.candidates) {
    const ref = "refs/heads/" + candidate.branch;
    const actual = git(["ls-remote", "origin", ref]).split(/\s+/u)[0];
    assert.equal(actual, candidate.sha,
      "PR #" + candidate.pr + " head changed; abort before composition");
    git(["fetch", "--no-tags", "origin", "+" + ref + ":refs/remotes/origin/" + candidate.branch]);
    assert.equal(git(["rev-parse", "refs/remotes/origin/" + candidate.branch]),
      candidate.sha);
    // Source commits must be descendants of the same base, not rewrites.
    git(["merge-base", "--is-ancestor", manifest.baseSha, candidate.sha]);
  }

  assert.ok(!existsSync(candidateDirectory),
    "Rehearsal output worktree already exists; not replacing it");
  git(["worktree", "add", "--detach", candidateDirectory, originalHead]);
  let completed = false;
  let reconciliations = 0;
  try {
    git(["config", "user.name", "B173 Ephemeral Rehearsal"], candidateDirectory);
    git(["config", "user.email", "b173-rehearsal@example.invalid"], candidateDirectory);
    const merged = [];
    const basePackage = git(["show", manifest.baseSha + ":package.json"], candidateDirectory);

    for (const candidate of manifest.candidates) {
      let conflicted = false;
      try {
        git(["merge", "--no-ff", "--no-edit", "--no-gpg-sign",
          "-m", "B173 rehearsal only: PR #" + candidate.pr, candidate.sha],
          candidateDirectory);
      } catch (error) {
        const paths = git(["diff", "--name-only", "--diff-filter=U"], candidateDirectory)
          .split("\n").filter(Boolean);
        // Never auto-accept a surprising collision, even if it looks benign.
        assert.deepEqual(paths, ["package.json"],
          "PR #" + candidate.pr + " has non-reconcilable conflict(s): " + paths.join(","));
        assert.ok(candidate.newTestScript,
          "Only independent additive Web test scripts may conflict");
        const sources = [...merged, candidate]
          .filter(x => x.newTestScript)
          .map(x => ({
            pr: x.pr,
            newTestScript: x.newTestScript,
            text: git(["show", x.sha + ":package.json"], candidateDirectory),
          }));
        const combined = reconcilePackageScripts(basePackage, sources);
        writeFileSync(join(candidateDirectory, "package.json"), combined.text);
        git(["add", "--", "package.json"], candidateDirectory);
        git(["commit", "--no-gpg-sign", "--no-edit"], candidateDirectory);
        conflicted = true;
        reconciliations++;
        console.log(JSON.stringify({
          event: "ci.b173.test_script_reconciliation",
          pr: candidate.pr,
          scripts: combined.addedScripts,
          resolvedOnly: "package.json",
          noExistingTestRemoved: true,
        }));
      }
      merged.push(candidate);
      git(["merge-base", "--is-ancestor", candidate.sha, "HEAD"], candidateDirectory);
      assert.equal(git(["status", "--porcelain=v1", "--untracked-files=all"],
        candidateDirectory), "", "Dirty candidate after PR #" + candidate.pr);
      console.log(JSON.stringify({
        event: "ci.b173.candidate_merged_in_ephemeral_worktree",
        pr: candidate.pr, sha: candidate.sha,
        conflictReconciled: conflicted, pushed: false,
      }));
    }

    const scriptNames = manifest.candidates.filter(x => x.newTestScript)
      .map(x => x.newTestScript);
    const outputPackage = JSON.parse(readFileSync(join(candidateDirectory, "package.json"), "utf8"));
    for (const name of scriptNames) {
      assert.ok(outputPackage.scripts[name], "Missing combined test script " + name);
      assert.ok(outputPackage.scripts.test.includes("pnpm " + name),
        "Missing combined test invocation " + name);
    }
    assert.equal(outputPackage.scripts["audit:prod"],
      "pnpm audit --prod --audit-level high",
      "Production audit must not be weakened or renamed");
    assert.equal(git(["status", "--porcelain=v1", "--untracked-files=all"],
      candidateDirectory), "");
    assert.equal(git(["rev-parse", "HEAD"], process.cwd()), originalHead,
      "Source branch head was modified by rehearsal");

    const result = {
      event: "ci.b173.integration_rehearsal", status: "COMPOSED",
      originalHead, baseSha: manifest.baseSha,
      combinedSha: git(["rev-parse", "HEAD"], candidateDirectory),
      candidateShas: manifest.candidates.map(x => ({ pr: x.pr, sha: x.sha })),
      reconciliations, worktree: candidateDirectory,
      pushed: false, deployed: false,
      releaseAuthorized: false, productionAuditCertified: false,
    };
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_ENV) {
      writeFileSync(process.env.GITHUB_ENV,
        "B173_WORKTREE=" + candidateDirectory + "\n", { flag: "a" });
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY,
        "### B173 ephemeral composition\n" +
        "Original head: \`" + originalHead + "\`\n\n" +
        "Composed SHA (local only): \`" + result.combinedSha + "\`\n\n" +
        "PRs: " + result.candidateShas.map(x => "#" + x.pr).join(", ") +
        "\n\nConflicts reconciled (package scripts only): " + reconciliations +
        "\n\n**No push, merge to main, deploy or release authorization.**\n",
        { flag: "a" });
    }
    completed = true;
  } finally {
    if (!completed) {
      try {
        git(["worktree", "remove", "--force", candidateDirectory]);
      } catch {
        fail("Temporary worktree cleanup failed; inspect runner logs");
      }
    }
  }
}

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown integration failure");
}
