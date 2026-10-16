#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2] ?? process.cwd();
const withLocalEmbeddings = process.env.WITH_LOCAL_EMBEDDINGS === 'true';
const PEER_ONLY_ROOTS = new Set([
  'prisma',
  'typescript',
  ...(withLocalEmbeddings ? [] : ['@xenova/transformers']),
]);
const store = join(repo, 'node_modules/.pnpm');

const tree = JSON.parse(
  execFileSync(
    'pnpm',
    ['list', '--prod', '--depth', 'Infinity', '--json', '--filter', '@library/api...'],
    { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
);

const keep = new Set();
const visit = node => {
  for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
    if (PEER_ONLY_ROOTS.has(name)) continue;
    const match = /node_modules\/\.pnpm\/([^/]+)\//.exec(dep.path ?? '');
    if (match) keep.add(match[1]);
    visit(dep);
  }
};
for (const project of tree) visit(project);

let removed = 0;
for (const dir of readdirSync(store)) {
  if (dir === 'node_modules' || dir === 'lock.yaml' || keep.has(dir)) continue;
  rmSync(join(store, dir), { recursive: true, force: true });
  removed += 1;
}
for (const name of PEER_ONLY_ROOTS) {
  const link = join(repo, 'node_modules', name);
  if (existsSync(link)) rmSync(link, { recursive: true, force: true });
}

let wasmRemoved = 0;
for (const dir of readdirSync(store)) {
  if (!dir.startsWith('@prisma+client@')) continue;
  const runtime = join(store, dir, 'node_modules/@prisma/client/runtime');
  if (!existsSync(runtime)) continue;
  for (const file of readdirSync(runtime)) {
    if (file.startsWith('query_compiler') && !file.includes('query_compiler_fast_bg.postgresql.')) {
      rmSync(join(runtime, file), { force: true });
      wasmRemoved += 1;
    }
  }
}
let trimmedBytes = 0;
const sizeOf = dir => {
  let total = 0;
  const walk = d => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) total += statSync(full).size;
    }
  };
  if (!existsSync(dir)) return 0;
  if (statSync(dir).isFile()) return statSync(dir).size;
  walk(dir);
  return total;
};
const trim = (path, keepNames = new Set()) => {
  if (!existsSync(path)) return;
  for (const name of readdirSync(path)) {
    if (keepNames.has(name)) continue;
    const full = join(path, name);
    trimmedBytes += sizeOf(full);
    rmSync(full, { recursive: true, force: true });
  }
};
for (const dir of readdirSync(store)) {
  const base = join(store, dir, 'node_modules');
  if (dir.startsWith('onnxruntime-node@')) {
    const bin = join(base, 'onnxruntime-node/bin/napi-v3');
    trim(bin, new Set([process.platform]));
    trim(join(bin, process.platform), new Set([process.arch]));
  } else if (dir.startsWith('onnxruntime-web@')) {
    trim(join(base, 'onnxruntime-web/dist'), new Set(['ort-web.node.js']));
  } else if (dir.startsWith('@xenova+transformers@')) {
    trim(join(base, '@xenova/transformers/dist'));
  } else if (dir.startsWith('protobufjs@')) {
    trim(join(base, 'protobufjs/cli'));
  }
}
console.log(
  `[prune-peers] local embeddings ${withLocalEmbeddings ? 'kept' : 'excluded'}; kept ${keep.size} packages, removed ${removed}; removed ${wasmRemoved} non-PostgreSQL query-compiler files; trimmed ${(trimmedBytes / 1e6).toFixed(0)} MB of other-platform/browser artefacts`
);
