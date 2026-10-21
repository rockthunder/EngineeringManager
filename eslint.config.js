import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { importX } from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';

/**
 * Dependency direction: adapters → application → domain.
 * The domain imports nothing from application or adapters, no packages, no node: builtins,
 * and has no ambient time or randomness (time arrives through the Clock port).
 */
export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'web', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/domain', from: './src/application', message: 'domain must not import application' },
            { target: './src/domain', from: './src/adapters', message: 'domain must not import adapters' },
            { target: './src/domain', from: './web', message: 'domain must not import web' },
            { target: './src/application', from: './src/adapters', message: 'application must not import adapters' },
            { target: './src/application', from: './web', message: 'application must not import web' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^[^./]',
              message: 'domain is pure TypeScript: relative imports only (no packages, no node: builtins)',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'No Date.now() in domain: use the Clock port',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'No new Date() in domain: use the Clock port',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'No Math.random() in domain: inject a seeded PRNG',
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'No Date.now() in application: use the Clock port',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'No new Date() in application: use the Clock port',
        },
      ],
    },
  },
);
