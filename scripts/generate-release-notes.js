import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const OUTPUT_PATH = path.resolve(process.cwd(), 'public', 'release-notes.json');
const MAX_COMMITS = 20;

const safeTrim = (value, max = 160) => {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3)}...`;
};

const readCommits = () => {
  const format = '%H%x09%cI%x09%s';
  const raw = execFileSync(
    'git',
    ['log', '-n', String(MAX_COMMITS), `--pretty=format:${format}`],
    { encoding: 'utf8' }
  ).trim();
  if (!raw) return [];

  return raw
    .split('\n')
    .map(line => line.split('\t'))
    .filter(parts => parts.length >= 3)
    .map(([sha, committedAt, subject]) => ({
      id: sha.slice(0, 12),
      date: committedAt,
      summary: safeTrim(subject),
    }));
};

const writeReleaseNotes = notes => {
  const payload = {
    generatedAt: new Date().toISOString(),
    items: notes,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`[release-notes] wrote ${notes.length} item(s) to ${OUTPUT_PATH}`);
};

try {
  const items = readCommits();
  writeReleaseNotes(items);
} catch (error) {
  console.error('[release-notes] failed to generate release notes:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
