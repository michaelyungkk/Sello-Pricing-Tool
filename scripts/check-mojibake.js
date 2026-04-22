#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EXT_RE = /\.(ts|tsx|js|jsx|css|md|json)$/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.netlify', '.vite', '.git']);
const SKIP_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'scripts/check-mojibake.js']);
const PATTERNS = [
  String.fromCharCode(0x00e2, 0x20ac, 0x00a2), // â€¢
  String.fromCharCode(0x00e2, 0x20ac, 0x201d), // â€”
  String.fromCharCode(0x00e2, 0x02c6, 0x017e), // âˆž
  String.fromCharCode(0x00c2, 0x00a3), // Â£
  String.fromCharCode(0x00c3, 0x00a2), // Ã¢
  String.fromCharCode(0x00c3), // Ã
  '\uFFFD',
];

function getSourceFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && EXT_RE.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, index) => {
    PATTERNS.forEach((token) => {
      if (line.includes(token)) {
        hits.push({
          filePath,
          lineNumber: index + 1,
          token,
          line: line.trim(),
        });
      }
    });
  });
  return hits;
}

const files = getSourceFiles(process.cwd())
  .filter((f) => statSync(f).size < 2_000_000)
  .filter((f) => {
    const normalized = f.replace(/\\/g, '/');
    for (const skip of SKIP_FILES) {
      if (normalized.endsWith(skip)) return false;
    }
    return true;
  });
const findings = files.flatMap(scanFile);

if (findings.length > 0) {
  console.error('[encoding] Mojibake detected:');
  findings.slice(0, 200).forEach((f) => {
    console.error(`${f.filePath}:${f.lineNumber} token="${f.token}" ${f.line}`);
  });
  if (findings.length > 200) {
    console.error(`[encoding] ...and ${findings.length - 200} more`);
  }
  process.exit(1);
}

console.log(`[encoding] OK - scanned ${files.length} tracked source files`);
