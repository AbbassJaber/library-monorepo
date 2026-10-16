import { base } from '../../eslint.config.js';

export default [
  ...base,
  { files: ['src/**/*.ts'] },
  { files: ['src/cli.ts', 'src/evalDocs.ts'], rules: { 'no-console': 'off' } },
];
