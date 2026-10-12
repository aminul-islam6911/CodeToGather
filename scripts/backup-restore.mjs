#!/usr/bin/env node
// Local backup -> restore round-trip drill (`DEPLOY` M0.3, `RESIL`).
// Proves a dump taken from the running compose Postgres restores into a fresh
// database with the data intact. Run against the LOCAL compose stack only.
//
// Usage: docker compose up -d postgres && node scripts/backup-restore.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const user = process.env.POSTGRES_USER ?? "codetogather";
const db = process.env.POSTGRES_DB ?? "codetogather";
const restoreDb = "codetogather_restore_check";
const dumpFile = path.join(os.tmpdir(), `codetogather-${Date.now()}.dump`);
const marker = `drill-${Date.now()}`;

function compose(args, options = {}) {
  return execFileSync("docker", ["compose", ...args], { stdio: "inherit", ...options });
}

function psql(database, sql) {
  return compose(["exec", "-T", "postgres", "psql", "-U", user, "-d", database, "-tAc", sql], {
    stdio: ["inherit", "inherit", "inherit"],
  });
}

try {
  console.log("1/5 Writing a marker row into the primary database...");
  psql(db, `create table if not exists drill_marker(id text primary key); insert into drill_marker (id) values ('${marker}') on conflict do nothing;`);

  console.log("2/5 Dumping the primary database...");
  const dumped = execFileSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "pg_dump", "-U", user, "-Fc", db],
    { maxBuffer: 1024 * 1024 * 512 }
  );
  fs.writeFileSync(dumpFile, dumped);

  console.log("3/5 Recreating the restore database...");
  psql(db, `drop database if exists ${restoreDb};`);
  psql(db, `create database ${restoreDb};`);

  console.log("4/5 Restoring the dump into the restore database...");
  execFileSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "pg_restore", "-U", user, "-d", restoreDb],
    { input: fs.readFileSync(dumpFile), stdio: ["pipe", "inherit", "inherit"] }
  );

  console.log("5/5 Verifying the marker survived the round trip...");
  const out = execFileSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "psql", "-U", user, "-d", restoreDb, "-tAc",
      `select count(*) from drill_marker where id = '${marker}';`],
    { encoding: "utf8" }
  ).trim();

  if (out !== "1") {
    throw new Error(`marker not found after restore (got "${out}")`);
  }
  console.log("Backup/restore drill PASSED.");
} catch (error) {
  console.error("Backup/restore drill FAILED.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (fs.existsSync(dumpFile)) fs.rmSync(dumpFile);
}
