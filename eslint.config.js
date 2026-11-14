/**
 * The shared ESLint flat config.
 *
 * ESLint 9 dropped `.eslintrc` support, so every workspace package extends
 * this one file. Keeping the rules in a single place means a rule change
 * lands everywhere at once — a per-package config would drift.
 *
 * The rules are deliberately the ones that catch real defects in this codebase:
 * the floating promises and the `any`s that would hide a schema mismatch.
 * Style is Prettier's job, not ESLint's.
 */

const typescriptParser = require('@typescript-eslint/parser');
const typescriptPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/*.d.ts',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...typescriptPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      // The codebase uses `unknown` + narrowing rather than `any`; an `any`
      // would defeat the whole point of the hand-maintained database types.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // A type-only import written as a value import pulls the module into
      // the runtime bundle for no reason, and `import type` is erased by
      // the compiler — which is what keeps the shared package importable
      // from an Edge Function.
      '@typescript-eslint/consistent-type-imports': 'error',
      // A floating promise in an async handler is a silent failure.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
  {
    // The one-way dependency rule, enforced mechanically.
    //
    // `packages/shared` must not import from `apps/*`. The dependency is
    // one-way by design: the shared package is the contract, and the apps
    // consume it. An import the other way creates a cycle, and it is
    // worse than a cycle in the workspace — the Edge Functions mirror
    // copies `packages/shared/src` but **not** `apps/`, so the import
    // resolves in the workspace and fails only inside the container.
    //
    // The story requires **both** signals: this rule and a unit test in
    // `packages/shared` that scans its own source. Either failing is
    // enough to fail the build.
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/*', '../../apps/*', '../../../apps/*'],
              message:
                'packages/shared must not import from apps/*. The dependency is one-way — ' +
                'the shared package owns the contract and the apps consume it.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      // A test may legitimately reach for a loose type while it is building
      // a fixture; the assertion is what matters.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Prettier runs last so a formatting difference is never reported twice.
  prettierConfig,
];
