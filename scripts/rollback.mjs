#!/usr/bin/env node
// One-command rollback (`DEPLOY` M0.3). Re-deploys the previously-good image
// without rebuilding, so the tested artifact is restored unchanged.
//
// Usage:
//   PREVIOUS_APP_IMAGE=codetogather:sha-<previous> node scripts/rollback.mjs
//
// The current image tag is printed first so it can be restored if needed.
import { execFileSync } from "node:child_process";

const previous = process.env.PREVIOUS_APP_IMAGE;
if (!previous) {
  console.error(
    "Missing PREVIOUS_APP_IMAGE. Example: " +
      "PREVIOUS_APP_IMAGE=codetogather:sha-abc123 node scripts/rollback.mjs"
  );
  process.exit(1);
}

console.log(`Current app image: ${process.env.APP_IMAGE ?? "(compose default)"}`);
console.log(`Rolling back to:   ${previous}`);

try {
  execFileSync("docker", ["compose", "up", "-d", "--no-build"], {
    stdio: "inherit",
    env: { ...process.env, APP_IMAGE: previous },
  });
  console.log("Rollback complete.");
} catch (error) {
  console.error("Rollback failed. Is Docker running and the image tag available?");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
