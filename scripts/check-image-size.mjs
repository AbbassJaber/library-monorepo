#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const image = process.argv[2] ?? 'library-monorepo-api';
const maxMb = Number(process.env['IMAGE_MAX_MB'] ?? 300);
const bytes = Number(
  execFileSync('docker', ['image', 'inspect', image, '--format', '{{.Size}}'], {
    encoding: 'utf8',
  }).trim()
);
const mb = bytes / 1_000_000;
console.log(`[image-size] ${image}: ${mb.toFixed(0)} MB (max ${maxMb} MB)`);
process.exit(mb <= maxMb ? 0 : 1);
