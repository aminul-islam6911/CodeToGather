#!/usr/bin/env node
// Deterministic import-boundary check (`TREE`, `ARCH`). Runs as part of `npm run lint`.
// Rules enforced:
//   - features/* may not import another features/*
//   - server/* may not import client UI (components/*, features/*, app/*)
//   - components/* stay presentational (no features/*, no server/*)
// Import specifiers use NodeNext ".js" extensions; they are resolved back to ".ts".
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const EXTENSIONS = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"];
const IMPORT_RE =
  /(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    entry.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

function areaOf(file) {
  const rel = path.relative(SRC, file).split(path.sep);
  return rel.length >= 2 ? rel[0] : null;
}

function featureOf(file) {
  const rel = path.relative(SRC, file).split(path.sep);
  return rel[0] === "features" && rel.length >= 2 ? rel[1] : null;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return base;
}

const violations = [];
const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(IMPORT_RE)) {
    const spec = match[1] ?? match[2];
    if (!spec) continue;
    const resolved = resolveImport(file, spec);
    if (!resolved) continue;

    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const fromArea = areaOf(file);
    const toArea = areaOf(resolved);
    const fromFeature = featureOf(file);
    const toFeature = featureOf(resolved);

    if (fromFeature && toFeature && fromFeature !== toFeature) {
      violations.push(`${rel}: feature "${fromFeature}" imports feature "${toFeature}" (${spec})`);
    }
    if (fromArea === "server" && ["components", "features", "app"].includes(toArea)) {
      violations.push(`${rel}: server code imports client UI "${toArea}" (${spec})`);
    }
    if (fromArea === "components" && ["features", "server"].includes(toArea)) {
      violations.push(`${rel}: components must stay presentational; imports "${toArea}" (${spec})`);
    }
  }
}

if (violations.length > 0) {
  console.error("Import boundary violations:");
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}
console.log(`Import boundaries OK (${files.length} files scanned).`);
