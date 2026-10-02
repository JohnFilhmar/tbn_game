/** Jest runs the colocated `*.spec.ts` files. SWC strips types; `npm run typecheck` checks them. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  // One worker: every test file shares one database and one pg-boss queue.
  maxWorkers: 1,
  testTimeout: 60_000,
  setupFiles: ['<rootDir>/src/testing/jest_setup.ts'],
  testRegex: 'src/.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2023',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
