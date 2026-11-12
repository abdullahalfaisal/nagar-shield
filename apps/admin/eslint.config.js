/**
 * The admin app's ESLint flat config.
 *
 * It extends the shared root config so a rule change lands in every
 * workspace at once, and adds the Next.js-specific rules on top. The config
 * stays CommonJS because the root `eslint.config.js` is CommonJS too and the
 * two are composed with `require`.
 */

const rootConfig = require('../../eslint.config.js');

module.exports = [
  ...rootConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Next.js server components legitimately use `any` in a few generated
      // positions; the shared `no-explicit-any` rule stays on everywhere else.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
];
