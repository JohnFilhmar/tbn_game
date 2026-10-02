import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** Nest lifecycle and framework method names keep the casing the framework requires. */
const framework_methods =
  '^(onModuleInit|onModuleDestroy|onApplicationBootstrap|beforeApplicationShutdown|onApplicationShutdown|canActivate|intercept|transform|catch|use)$';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'backend/src/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^(\\.\\./){2,}', message: 'Use a path alias.' }] },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'Read configuration through the config module.',
        },
      ],
    },
  },
  {
    files: ['backend/src/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['snake_case'], leadingUnderscore: 'allow' },
        { selector: 'variable', format: ['snake_case', 'UPPER_CASE'] },
        // Zod schemas keep the contracts naming everywhere: PascalCase with a Schema suffix.
        {
          selector: 'variable',
          filter: { regex: 'Schemas?$', match: true },
          format: ['PascalCase'],
        },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
        { selector: 'import', format: null },
        {
          selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'],
          format: null,
        },
        {
          selector: 'classMethod',
          filter: { regex: framework_methods, match: true },
          format: null,
        },
      ],
    },
  },
  {
    // Decorator factories read as annotations, so they keep Nest's PascalCase: @Public(), @ZodBody().
    files: ['backend/src/**/*.decorator.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'function', format: ['PascalCase'] },
        { selector: 'variable', format: ['snake_case', 'PascalCase', 'UPPER_CASE'] },
        { selector: 'typeLike', format: ['PascalCase'] },
      ],
    },
  },
  {
    files: ['packages/contracts/src/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'variable', format: ['snake_case', 'UPPER_CASE'] },
        {
          selector: 'variable',
          filter: { regex: 'Schemas?$', match: true },
          format: ['PascalCase'],
        },
        { selector: 'function', format: ['snake_case'] },
        { selector: 'typeLike', format: ['PascalCase'] },
      ],
    },
  },
  {
    // The client: camelCase identifiers, PascalCase components and types. API payload fields keep
    // the backend's snake_case, so object properties and destructured names are free.
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.flat['recommended-latest'].rules,
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'variable', format: ['camelCase', 'PascalCase', 'UPPER_CASE'] },
        { selector: 'variable', modifiers: ['destructured'], format: null },
        { selector: 'parameter', modifiers: ['destructured'], format: null },
        { selector: 'function', format: ['camelCase', 'PascalCase'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'import', format: null },
        {
          selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'],
          format: null,
        },
      ],
    },
  },
  {
    files: [
      'client/vite.config.ts',
      'client/playwright.config.ts',
      'client/e2e/**/*.ts',
      'backend/src/config/load_config.ts',
      'backend/prisma.config.ts',
      'backend/src/testing/jest_setup.ts',
      'backend/src/testing/test_database.ts',
      'backend/src/testing/test_worker.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },
);
