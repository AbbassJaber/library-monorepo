import { base } from '../../eslint.config.js';

export default [
  ...base,
  { files: ['src/**/*.ts', 'prisma/**/*.ts'] },
  { ignores: ['src/generated/**'] },
  { files: ['prisma/**/*.ts'], rules: { 'no-console': 'off' } },
];
