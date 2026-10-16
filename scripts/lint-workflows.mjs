#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLinter } from 'actionlint';

const dir = join(process.cwd(), '.github/workflows');
const lint = await createLinter();
let problems = 0;
for (const name of readdirSync(dir).filter(file => /\.ya?ml$/.test(file))) {
  const path = join(dir, name);
  for (const result of lint(readFileSync(path, 'utf8'), path)) {
    problems += 1;
    console.error(
      `${result.file}:${result.line}:${result.column}: ${result.message} [${result.kind}]`
    );
  }
}
console.log(problems === 0 ? '[actionlint] ok' : `[actionlint] ${problems} problem(s)`);
process.exit(problems === 0 ? 0 : 1);
