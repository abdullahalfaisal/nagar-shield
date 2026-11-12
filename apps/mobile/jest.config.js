/**
 * Jest configuration for the mobile app.
 *
 * The preset is `jest-expo`, which knows how to transform React Native and
 * Expo modules. The tests that exist today are pure functions, but the preset
 * is what a future component test will need.
 *
 * `transformIgnorePatterns` is deliberately NOT overridden: `jest-expo`
 * already ships a pattern that understands the pnpm store layout
 * (`node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>`), and a naive
 * override drops the React Native setup file out of the transform and the
 * suite fails to parse it.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
};
