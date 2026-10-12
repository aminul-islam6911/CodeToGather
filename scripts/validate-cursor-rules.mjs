#!/usr/bin/env node
// Validates Cursor rules. Run from repo root: node scripts/validate-cursor-rules.mjs [--strict]
// Deps: picomatch (npm i -D picomatch). Exit 1 on any ERROR.
import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict"); // --strict: dead globs fail the run (use in CI once the project is scaffolded)
const RULES_DIR = path.join(ROOT, ".cursor", "rules");
const LIMITS = { alwaysTotalBytes: 8000, warnLines: 150, errorLines: 500 }; // team policy, not Cursor limits
const ALLOWED_KEYS = new Set(["description", "globs", "alwaysApply"]);
const HIDDEN = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u{E0000}-\u{E007F}]/u;
const SECRETS = [/AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bsk-[A-Za-z0-9]{20,}/, /\bghp_[A-Za-z0-9]{30,}/];

const errors = [], warns = [];
const err = (f, m) => errors.push(`ERROR ${f}: ${m}`);
const warn = (f, m) => warns.push(`WARN  ${f}: ${m}`);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "build", ".next"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(path.relative(ROOT, p).split(path.sep).join("/"));
  }
  return out;
}

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const fm = {}; let lastKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
    const li = line.match(/^\s*-\s+(.*)$/);
    if (kv) { lastKey = kv[1]; fm[lastKey] = kv[2].trim(); }
    else if (li && lastKey) fm[lastKey] = (fm[lastKey] ? fm[lastKey] + "," : "") + li[1].trim();
    else if (line.trim()) warn("frontmatter", `unparsed line: "${line}"`);
  }
  return { fm, body: m[2] };
}

const splitGlobs = (v) => v.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);

const allFiles = walk(ROOT);
if (fs.existsSync(path.join(ROOT, ".cursorrules"))) warn(".cursorrules", "legacy file present; migrate to .cursor/rules/*.mdc");
if (!fs.existsSync(RULES_DIR)) { console.log("No .cursor/rules directory found."); process.exit(errors.length ? 1 : 0); }

const ruleFiles = allFiles.filter((f) => f.includes(".cursor/rules/"));
let alwaysBytes = 0; const manifest = [];

for (const f of ruleFiles) {
  const ext = path.extname(f);
  if (ext !== ".mdc") { if (!/readme\.md$/i.test(f)) err(f, "not .mdc -> Cursor silently ignores it as a project rule"); continue; }
  const text = fs.readFileSync(path.join(ROOT, f), "utf8");
  const lines = text.split(/\r?\n/).length;
  if (lines > LIMITS.errorLines) err(f, `${lines} lines > ${LIMITS.errorLines}; split it`);
  else if (lines > LIMITS.warnLines) warn(f, `${lines} lines > ${LIMITS.warnLines}; consider splitting`);
  if (HIDDEN.test(text)) err(f, "hidden/bidi/zero-width unicode found (possible rules-file injection)");
  for (const re of SECRETS) if (re.test(text)) err(f, `possible secret matches ${re}`);

  const parsed = parseFrontmatter(text);
  if (!parsed) { err(f, "missing or malformed frontmatter (--- ... ---)"); continue; }
  const { fm, body } = parsed;
  for (const k of Object.keys(fm)) if (!ALLOWED_KEYS.has(k)) warn(f, `unknown frontmatter key "${k}"`);
  if (!body.trim()) err(f, "empty rule body");
  if ("alwaysApply" in fm && !/^(true|false)$/.test(fm.alwaysApply)) err(f, "alwaysApply must be true or false");

  const always = fm.alwaysApply === "true";
  const globs = fm.globs ? splitGlobs(fm.globs) : [];
  const desc = (fm.description || "").trim();
  let mode;
  if (always) { mode = "always"; alwaysBytes += Buffer.byteLength(text); if (globs.length || desc) warn(f, "globs/description are ignored when alwaysApply is true"); }
  else if (globs.length) { mode = "globs"; if (!desc) warn(f, "globs rule has no description (hurts humans and tooling)"); }
  else if (desc) mode = "intelligent";
  else { mode = "manual"; }
  if (mode === "intelligent" && !/^use when/i.test(desc)) warn(f, 'description should start with "Use when ..." so the agent can decide relevance');

  for (const g of globs) {
    if (["*", "**", "**/*"].includes(g)) warn(f, `glob "${g}" matches everything; use alwaysApply or narrow it`);
    const isMatch = picomatch(g, { dot: true });
    const hits = allFiles.filter((p) => !p.includes(".cursor/rules/") && isMatch(p)).length;
    if (hits === 0) (STRICT ? err : warn)(f, `dead glob "${g}" matches 0 tracked files`);
  }
  for (const m of body.matchAll(/(?<![\w@])@([\w./-]+\.[A-Za-z]{1,5})\b/g)) {
    if (m[1].includes("/") && !fs.existsSync(path.join(ROOT, m[1]))) warn(f, `@${m[1]} referenced but not found`);
  }
  manifest.push({ file: f, mode, lines });
}

if (alwaysBytes > LIMITS.alwaysTotalBytes) err("always-on rules", `${alwaysBytes} bytes > budget ${LIMITS.alwaysTotalBytes}`);
console.table(manifest);
console.log(`always-on bytes: ${alwaysBytes}/${LIMITS.alwaysTotalBytes}`);
[...warns, ...errors].forEach((l) => console.log(l));
console.log(`\n${errors.length} error(s), ${warns.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
