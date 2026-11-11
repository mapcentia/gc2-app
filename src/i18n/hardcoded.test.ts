import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { findHardcoded } from './testing/findHardcoded';
import { PENDING } from './testing/pending';

const SRC = path.resolve(__dirname, '..');
const SKIP = ['spike', 'layout/SideMenu.tsx', 'features/map/fieldDefs.tsx'];

const rel = (p: string) => path.relative(SRC, p).split(path.sep).join('/');
const isUnder = (file: string, entry: string) => file === entry || file.startsWith(entry + '/');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

describe('hard-coded UI text', () => {
  it('no converted .tsx file contains hard-coded UI text', () => {
    const lines = walk(SRC)
      .map(rel)
      .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
      .filter((f) => ![...SKIP, ...PENDING].some((s) => isUnder(f, s)))
      .flatMap((f) =>
        findHardcoded(fs.readFileSync(path.join(SRC, f), 'utf8'), f).map((x) => `${x.file}:${x.line} ${x.text}`),
      );
    expect(lines).toEqual([]);
  });

  it('every PENDING entry exists on disk', () => {
    expect(PENDING.filter((p) => !fs.existsSync(path.join(SRC, p)))).toEqual([]);
  });
});
