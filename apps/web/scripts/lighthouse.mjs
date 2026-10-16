import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const API = `${BASE}/api/v1`;
const PORT = Number(process.env.LIGHTHOUSE_PORT ?? 9333);
const BASELINE = fileURLToPath(new URL('../lighthouse-baseline.json', import.meta.url));
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const PERFORMANCE_SLACK = 15;
const PASSWORD = 'Password123!';
const UPDATE = process.argv.includes('--update');

const sessionCookie = async email => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  return res.headers
    .getSetCookie()
    .map(line => line.split(';')[0])
    .join('; ');
};

const reader = await sessionCookie('reader@library.local');
const librarian = await sessionCookie('librarian@library.local');
const newest = await (await fetch(`${API}/books/newest`)).json();

const pages = [
  ['Home', '/', reader],
  ['Catalog', '/catalog', reader],
  ['Book detail', `/books/${newest.data[0].id}`, reader],
  ['Activity', '/librarian/activity', librarian],
];
const presets = [
  ['desktop', desktopConfig],
  ['mobile', undefined],
];

const browser = await chromium.launch({
  channel: process.platform === 'darwin' ? 'chrome' : undefined,
  args: [`--remote-debugging-port=${PORT}`],
});
const scores = {};
try {
  for (const [preset, config] of presets)
    for (const [name, path, cookie] of pages) {
      const result = await lighthouse(
        `${BASE}${path}`,
        {
          port: PORT,
          output: 'json',
          logLevel: 'error',
          onlyCategories: CATEGORIES,
          extraHeaders: { cookie },
        },
        config
      );
      scores[`${preset} · ${name}`] = Object.fromEntries(
        CATEGORIES.map(id => [id, Math.round((result?.lhr.categories[id]?.score ?? 0) * 100)])
      );
    }
} finally {
  await browser.close();
}

if (UPDATE) {
  writeFileSync(BASELINE, `${JSON.stringify(scores, null, 2)}\n`);
  console.table(scores);
  console.log(`baseline written: ${BASELINE}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const drops = [];
const rows = {};
for (const [key, now] of Object.entries(scores)) {
  rows[key] = {};
  for (const category of CATEGORIES) {
    const before = baseline[key]?.[category];
    const slack = category === 'performance' ? PERFORMANCE_SLACK : 0;
    rows[key][category] =
      before === undefined ? `${now[category]}` : `${now[category]} (${before})`;
    if (before !== undefined && now[category] < before - slack)
      drops.push(`${key} ${category}: ${now[category]} < baseline ${before} − ${slack}`);
  }
}
console.table(rows);
console.log('score (baseline)');
if (drops.length > 0) {
  console.error(`Lighthouse scores dropped:\n  ${drops.join('\n  ')}`);
  process.exit(1);
}
console.log('no score below the baseline');
