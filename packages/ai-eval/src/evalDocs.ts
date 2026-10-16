import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './env.js';
import { RESULTS_DIR, publishedResults, withEvalBlock } from './report.js';

const tables = publishedResults(readdirSync(RESULTS_DIR)).map(name =>
  readFileSync(join(RESULTS_DIR, name), 'utf8').trim()
);
const docPath = join(REPO_ROOT, 'docs', 'evaluation.md');
writeFileSync(docPath, withEvalBlock(readFileSync(docPath, 'utf8'), tables, 'pnpm eval:docs'));
console.log(`docs/evaluation.md: ${tables.length} result tables`);
