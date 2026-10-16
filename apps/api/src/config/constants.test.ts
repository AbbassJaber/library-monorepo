import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { AiFeature, ToolName } from '@library/contracts';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../../../..');
const ROOTS = ['apps/api/src', 'apps/api/prisma', 'apps/web/src', 'apps/web/e2e', 'packages'];
const ALLOWED = new Set([
  'packages/contracts/src/constants.ts',
  'apps/api/src/config/constants.ts',
]);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'generated', 'seed']);
const LITERAL = /['"`](book|genre|shelf|favorites|user)\.|['"`]lib_|['"`]x-/i;

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
};

describe('magic strings', () => {
  it('audit actions, cookie names and header names appear only in the constants files', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(REPO, root))) {
        const rel = relative(REPO, file);
        if (ALLOWED.has(rel)) continue;
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (LITERAL.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('tool and AI feature names come from the contracts enums in production code', () => {
    const DEFINITIONS = new Set(['packages/contracts/src/ai.ts']);
    const TEST_FILE = /\.test\.tsx?$|\/testing\/|\/src\/test\/|\/smoke\/|\/e2e\//;
    const names = [...ToolName.options, ...AiFeature.options].join('|');
    const literal = new RegExp(`['"\`](${names})['"\`]`);
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(REPO, root))) {
        const rel = relative(REPO, file);
        if (DEFINITIONS.has(rel) || TEST_FILE.test(rel)) continue;
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (literal.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
