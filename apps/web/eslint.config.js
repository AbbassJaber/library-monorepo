import { react } from '../../eslint.config.js';

export default [
  ...react,
  { files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts'] },
  { ignores: ['dist/**'] },
];
