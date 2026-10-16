import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

const sources = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full);
  }
  return out;
};

describe('packaging', () => {
  it('has no prisma, express or pg in its dependencies', () => {
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const banned of ['prisma', '@prisma/client', '@prisma/adapter-pg', 'express', 'pg'])
      expect(names, banned).not.toContain(banned);
  });

  it('references @xenova/transformers only through a lazy import() in embeddings/local.ts', () => {
    for (const file of sources(join(root, 'src'))) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes('@xenova/transformers')) continue;
      expect(file.endsWith('providers/embeddings/local.ts'), file).toBe(true);
      expect(text).not.toMatch(/^import .*@xenova\/transformers/m);
      expect(text).toMatch(/await import\('@xenova\/transformers'\)/);
    }
  });

  it('does not load ONNX or transformers when the package is imported', () => {
    if (!existsSync(join(root, 'dist/index.js')))
      execFileSync('pnpm', ['-s', 'build'], { cwd: root, stdio: 'ignore' });
    const loaded = execFileSync(
      process.execPath,
      [
        '--import',
        join(root, 'scripts/trace-imports.mjs'),
        '--input-type=module',
        '-e',
        "await import('./dist/index.js'); process.stdout.write(globalThis.__loaded ?? '')",
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(loaded).toContain('dist/index.js');
    expect(loaded).not.toMatch(/xenova|onnxruntime|transformers/);
  });
});
