/**
 * Jest configuration for the moderator console.
 *
 * `next/jest` wires up the SWC transform, the module aliases and the CSS
 * handling so a component test needs no extra plumbing. The environment is
 * `jsdom` because the console is a browser app.
 *
 * @type {import('jest').Config}
 */
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^@nagar-shield/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
};

module.exports = createJestConfig(config);
