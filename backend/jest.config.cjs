/** Jest runs the colocated `*.spec.ts` files. SWC strips types; `npm run typecheck` checks them. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  // One worker: every test file shares one database and one pg-boss queue. The worker is a child
  // process recycled past this size, because `--experimental-vm-modules` keeps every test file's
  // module graph alive, about 50 MB each, which an in-band run cannot shed.
  maxWorkers: 1,
  workerIdleMemoryLimit: '1GB',
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
