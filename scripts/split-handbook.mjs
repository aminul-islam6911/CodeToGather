#!/usr/bin/env node
// Splits the handbook into one file per section ID so agents load only what they need.
// Usage: node scripts/split-handbook.mjs PRODUCTION_BASE_WEB_APP.md docs/handbook
import fs from "node:fs";
import path from "node:path";

const [src = "PRODUCTION_BASE_WEB_APP.md", outDir = "docs/handbook"] = process.argv.slice(2);
const text = fs.readFileSync(src, "utf8");
fs.mkdirSync(outDir, { recursive: true });

// A section starts at "## <n>. <title> (`ID`)"; everything before the first one is the preamble.
const re = /^## (\d+)\. (.+?) \(`([A-Z]+)`\)\s*$/gm;
const marks = [...text.matchAll(re)].map((m) => ({ id: m[3], n: m[1], title: m[2], at: m.index }));
if (!marks.length) { console.error("No sections found"); process.exit(1); }

fs.writeFileSync(path.join(outDir, "_00_PREAMBLE.md"), text.slice(0, marks[0].at).trim() + "\n");
marks.forEach((m, i) => {
  const end = i + 1 < marks.length ? marks[i + 1].at : text.length;
  const body = text.slice(m.at, end).replace(/\n---\s*$/, "").trim() + "\n";
  fs.writeFileSync(path.join(outDir, `${m.id}.md`), body);
  console.log(`${m.id}.md  (§${m.n} ${m.title}, ${body.split("\n").length} lines)`);
});
