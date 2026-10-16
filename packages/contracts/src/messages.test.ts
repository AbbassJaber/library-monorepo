import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VALIDATION_CODES } from './constants.js';

const sources = readdirSync(import.meta.dirname)
  .filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map(name => [name, readFileSync(join(import.meta.dirname, name), 'utf8')] as const);

const MESSAGE_LITERAL =
  /(?:message|error):\s*'([^']*)'|\.(?:regex|min|max|length|email|url|refine|check)\([^,)]*,\s*'([^']*)'\)/g;

describe('contract validation messages', () => {
  it('are codes without spaces', () => {
    const offenders: string[] = [];
    for (const [name, text] of sources) {
      for (const match of text.matchAll(MESSAGE_LITERAL)) {
        const literal = match[1] ?? match[2] ?? '';
        if (literal.includes(' ')) offenders.push(`${name}: '${literal}'`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every code is dotted and listed in VALIDATION_CODES', () => {
    for (const code of Object.values(VALIDATION_CODES)) expect(code).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
  });
});
