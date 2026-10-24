import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  AUDIT_ARGS,
  executePnpmAudit,
  fileDigest,
  runProductionAudit,
} from "./reliable-production-audit.mjs";

/**
 * Uses the exact same pnpm audit --prod --audit-level high command as the
 * canonical audit:prod script. No JSON-only audit, waiver or silent PASS.
 */
async function main() {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  if (pkg.scripts?.["audit:prod"] !== "pnpm " + AUDIT_ARGS.join(" ")) {
    throw new Error("Mandatory audit:prod command has changed");
  }
  const fingerprint = async () => [
    await fileDigest("package.json"),
    await fileDigest("pnpm-lock.yaml"),
    await fileDigest("security/audit-exceptions.json"),
  ].join(":");

  const outcome = await runProductionAudit({
    execute: async () => {
      const response = await executePnpmAudit();
      // Print live official evidence once per real attempt. This is evidence,
      // not a replacement for the process exit status and strict classifier.
      process.stdout.write(response.output);
      return response;
    },
    sleep: (ms) => delay(ms),
    fingerprint,
    emit: (entry) => console.log(JSON.stringify(entry)),
  });
  console.log(JSON.stringify({
    event: "security.audit.final",
    status: outcome.status,
    exitCode: outcome.exitCode,
    auditCommand: "pnpm " + AUDIT_ARGS.join(" "),
    releaseAuthorized: false,
    waived: false,
  }));
  process.exitCode = outcome.exitCode;
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({
    event: "security.audit.final",
    status: "INVALID_EVIDENCE",
    reason: error instanceof Error ? error.message : "unexpected error",
    releaseAuthorized: false,
    waived: false,
  }));
  process.exitCode = 2;
}
