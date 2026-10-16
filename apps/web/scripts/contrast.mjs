import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(here, '..', 'src', 'styles', 'tokens.css'), 'utf8');
const domainSrc = path.join(here, '..', '..', '..', 'packages', 'domain-config', 'src');

const block = selector => {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`tokens.css: no block for ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const vars = {};
  for (const m of css.slice(open, close).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6}|\d+%)/gi))
    vars[m[1]] = m[2];
  return vars;
};
const dark = block(":root[data-theme='dark']");
const light = block(":root[data-theme='light']");
const systemLight = block(':root:not([data-theme])');

const paletteOf = file => {
  const source = readFileSync(path.join(domainSrc, file), 'utf8');
  const named = Object.fromEntries(
    [...source.matchAll(/^\s+(\w+): '(#[0-9a-f]{6})',$/gim)].map(m => [m[1], m[2]])
  );
  const body = source.slice(source.indexOf('palette:'));
  const hex = "'(#[0-9a-f]{6})'";
  const entry = new RegExp(
    `\\[\\s*${hex},\\s*${hex},\\s*${hex},\\s*(?:${hex}|stages\\.(\\w+))\\s*\\]`,
    'gi'
  );
  return [...body.matchAll(entry)].map(m => [m[1], m[2], m[3], m[4] ?? named[m[5]]]);
};
const palettes = [
  ['books', paletteOf('books/index.ts')],
  ['movies', paletteOf('movies/index.ts')],
];
const stage = block('.cover-stage {');

const toLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const lum = hex => {
  const [r, g, b] = rgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (h + 0.05) / (l + 0.05);
};

const pairs = [
  ['text', 'bg', 4.5, 'body text'],
  ['text', 'nav', 4.5, 'sidebar text'],
  ['text', 'surface', 4.5, 'text on panels'],
  ['text', 'surface-2', 4.5, 'text on raised panels, active nav item'],
  ['text', 'input', 4.5, 'typed text'],
  ['text-2', 'bg', 4.5, 'secondary text'],
  ['text-2', 'nav', 4.5, 'sidebar links'],
  ['text-2', 'surface', 4.5, 'secondary text on panels'],
  ['text-2', 'surface-2', 4.5, 'secondary text on raised panels'],
  ['text-3', 'bg', 4.5, 'tertiary text (meta, counts)'],
  ['text-3', 'nav', 4.5, 'sidebar group labels, AI status'],
  ['text-3', 'surface', 4.5, 'tertiary text on panels'],
  ['text-3', 'input', 4.5, 'placeholders'],
  ['bg', 'text', 4.5, 'primary pill (inverted)'],
  ['accent-ink', 'accent', 4.5, 'accent button label'],
  ['accent-ink', 'accent-hover', 4.5, 'accent button hover'],
  ['accent', 'bg', 3, 'accent button edge (non-text, 3:1)'],
  ['link', 'bg', 4.5, 'links'],
  ['link', 'surface', 4.5, 'links on panels'],
  ['link', 'accent-soft', 4.5, 'accent badge'],
  ['text', 'accent-soft', 4.5, 'own chat bubble, selected table row'],
  ['text-2', 'accent-soft', 4.5, 'secondary text in a selected table row'],
  ['success', 'bg', 4.5, 'success text, AI status dot'],
  ['success', 'surface', 4.5, 'success text on panels'],
  ['danger', 'bg', 4.5, 'error text'],
  ['danger', 'surface', 4.5, 'error text on panels'],
  ['danger', 'danger-soft', 4.5, 'error badge'],
  ['text', 'danger-soft', 4.5, 'error toast text'],
  ['danger-ink', 'danger-solid', 4.5, 'end-call button'],
  ['danger-solid', 'bg', 3, 'end-call button edge (non-text, 3:1)'],
  ['warning', 'bg', 4.5, 'warning text (time running out)'],
  ['warning', 'surface', 4.5, 'warning text on panels'],
  ['focus', 'bg', 3, 'focus ring (non-text, 3:1)'],
  ['focus', 'nav', 3, 'focus ring in the sidebar'],
  ['focus', 'surface', 3, 'focus ring on panels'],
  ['pill-text', 'pill-bg', 4.5, 'state pill on covers'],
  ['line', 'bg', 1.15, 'hairlines (structure only)'],
];

let failed = 0;
const report = (ok, line) => {
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${line}`);
};

const drift = Object.keys(light).filter(key => light[key] !== systemLight[key]);
console.log('\nsystem light block');
report(drift.length === 0, `matches the light theme${drift.length ? `: differs in ${drift}` : ''}`);
const callDark = block('.call-dark {');
const callDrift = Object.keys(dark).filter(key => dark[key] !== callDark[key]);
console.log('\ncall block (always dark)');
report(
  callDrift.length === 0,
  `matches the dark theme${callDrift.length ? `: differs in ${callDrift}` : ''}`
);

for (const [name, theme] of [
  ['dark', dark],
  ['light', light],
]) {
  console.log(`\n${name}`);
  for (const [fg, bg, min, note] of pairs) {
    const r = ratio(theme[fg], theme[bg]);
    report(
      r >= min,
      `${fg.padEnd(14)} on ${bg.padEnd(13)} ${r.toFixed(2).padStart(5)}:1 (min ${min})  ${note}`
    );
  }
}

const paper = block('.paper {');
console.log('\npaper (open book page, library card, reading list slip)');
for (const [fg, bg, min, note] of [
  ['text', 'bg', 4.5, 'page text'],
  ['text-2', 'bg', 4.5, 'running head, author, labels on the page'],
  ['text-3', 'bg', 4.5, 'meta on the page'],
  ['text', 'surface', 4.5, 'library card values'],
  ['text-2', 'surface', 4.5, 'library card labels'],
  ['accent-ink', 'accent', 4.5, 'dark pill (shelf control)'],
  ['accent-ink', 'accent-hover', 4.5, 'dark pill hover'],
  ['link', 'bg', 4.5, 'links on the page'],
  ['danger', 'bg', 4.5, 'errors on a slip'],
  ['success', 'bg', 4.5, 'success on a slip'],
  ['stamp', 'bg', 4.5, 'stamp on a slip'],
  ['stamp', 'surface', 4.5, 'stamp on the library card'],
  ['focus', 'bg', 3, 'focus ring on the page (non-text, 3:1)'],
  ['focus', 'surface', 3, 'focus ring on the card (non-text, 3:1)'],
  ['line-strong', 'bg', 1.4, 'outline pill edge (structure only)'],
]) {
  const r = ratio(paper[fg], paper[bg]);
  report(
    r >= min,
    `${fg.padEnd(14)} on ${bg.padEnd(13)} ${r.toFixed(2).padStart(5)}:1 (min ${min})  ${note}`
  );
}

const stageText = [
  ['text', 4.5],
  ['text-2', 4.5],
  ['text-3', 4.5],
  ['link', 4.5],
  ['focus', 3],
];
for (const [domainName, palette] of palettes) {
  console.log(`\ncovers (${domainName}, ${palette.length} entries)`);
  if (palette.length === 0) report(false, 'no palette found');
  for (const [coverBg, coverText, , stageBg] of palette) {
    const r = ratio(coverText, coverBg);
    if (!stageBg) {
      report(false, `${coverBg} has no stage color`);
      continue;
    }
    const checks = [
      ...stageText.map(([fg, min]) => ({ label: fg, r: ratio(stage[fg], stageBg), min })),
      { label: 'pill', r: ratio(stageBg, stage.text), min: 4.5 },
    ];
    const worst = checks.reduce((a, b) => (a.r / a.min <= b.r / b.min ? a : b));
    report(
      r >= 4.5 && checks.every(c => c.r >= c.min),
      `${coverBg} text ${coverText} ${r.toFixed(2).padStart(5)}:1 · stage ${stageBg} worst ${worst.label} ${worst.r.toFixed(2)}:1`
    );
  }
}

process.exit(failed > 0 ? 1 : 0);
