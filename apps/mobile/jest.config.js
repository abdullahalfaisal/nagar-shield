/**
 * Jest configuration for the mobile app.
 *
 * The suite runs as **two projects**, because the app needs two different
 * globals and the React Native preset only ships one set at a time.
 *
 * - **node** — the React Native environment from `jest-expo`. It has
 *   `TextEncoder` and `crypto.subtle`, which jsdom does not provide, and the
 *   capture and dial tests need both. This is the environment for almost the
 *   whole suite.
 * - **jsdom** — a browser-shaped global, which a React hook test
 *   (`renderHook` from `@testing-library/react`) needs: it has a `document`,
 *   and node does not.
 *
 * Neither environment can simply be turned on for the other one:
 *
 *   - `testEnvironment: 'jsdom'` on top of the base preset fails with
 *     *"Cannot redefine property: window"* — the RN preset's `setup.js`
 *     installs its own globals, and one of them is `window`.
 *   - `jest-expo/web` globally breaks the node-dependent suites the other
 *     way — the web environment strips the Node globals jsdom omits.
 *
 * So each project gets its own setup file: the base preset's `setup.js` for
 * node, and `setup-web.js` for jsdom, which does not define `window`.
 * `jest.dom.setup.js` then gives the jsdom project back the Node globals it
 * lacks.
 *
 * A test opts into jsdom with the `@jest-environment jsdom` docblock — but
 * with two projects, the docblock alone would not switch the *setup file*.
 * Instead the jsdom project is selected by the **file name**: a test under
 * `src/` named `*.dom.test.ts` runs in jsdom, everything else runs in node.
 *
 * `transformIgnorePatterns` is deliberately NOT overridden: `jest-expo`
 * already ships a pattern that understands the pnpm store layout
 * (`node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>`), and a naive
 * override drops the React Native setup file out of the transform and the
 * suite fails to parse it.
 *
 * @type {import('jest').Config}
 */
const path = require('node:path');

const DOM_TEST_MATCH = ['**/*.dom.test.ts', '**/*.dom.test.tsx'];
const NODE_TEST_MATCH = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '!**/*.dom.test.ts',
  '!**/*.dom.test.tsx',
];

/**
 * The jsdom project's setup files.
 *
 * `jest-expo/web`'s own `setup-web.js` replaces the RN `setup.js` — it is
 * the file that does **not** define `window`, which is what makes the jsdom
 * environment usable at all. The rest of the web preset's configuration
 * (the transform, the module name mapper) is inherited from the base preset,
 * so the two projects compile the same source the same way.
 */
const domSetupFiles = [
  require.resolve('jest-expo/src/preset/setup-web.js'),
  path.join(__dirname, 'jest.dom.setup.js'),
];

/**
 * The base preset, minus `passWithNoTests`.
 *
 * The preset sets `passWithNoTests: true`, which Jest 29 does not accept at
 * the **project** level — every run printed a validation warning. The key is
 * deleted rather than set to `undefined`, because a key that is present with
 * an `undefined` value is still "an option that was found".
 */
function basePreset() {
  const preset = { ...require('jest-expo/jest-preset') };
  delete preset.passWithNoTests;
  return preset;
}

module.exports = {
  projects: [
    {
      ...basePreset(),
      displayName: 'node',
      testEnvironment: require.resolve('jest-expo/src/preset/nativeEnvironment.js'),
      roots: ['<rootDir>/src'],
      testMatch: NODE_TEST_MATCH,
      setupFilesAfterEnv: ['<rootDir>/jest.dom.setup.js'],
    },
    {
      ...basePreset(),
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/src'],
      testMatch: DOM_TEST_MATCH,
      setupFiles: domSetupFiles,
      setupFilesAfterEnv: ['<rootDir>/jest.dom.setup.js'],
    },
  ],
};
