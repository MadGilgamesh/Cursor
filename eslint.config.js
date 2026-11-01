import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: [
      'apps/web/src/**/*.{ts,tsx}',
      'apps/web/test/**/*.{ts,tsx}',
      'apps/panel/src/**/*.{ts,tsx}',
      'apps/panel/test/**/*.{ts,tsx}',
    ],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Testy i skrypty CLI: dopuszczamy wygodniejsze konstrukcje.
    files: [
      '**/test/**',
      '**/tests/**',
      '**/scripts/**',
      'tools/*/src/report.ts',
      'apps/api/src/db/migrate.ts',
      'apps/api/src/db/bootstrap.ts',
      'apps/api/src/db/seed-local.ts',
      'apps/api/src/worker.ts',
    ],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
);
