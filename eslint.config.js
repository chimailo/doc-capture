import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/docs/.vitepress/cache/**',
      'apps/docs/api/**',
      'apps/demo/public/**',
      'packages/opencv-build/build/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['packages/react/**/*.{ts,tsx}', 'apps/demo/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Privacy: the SDK must never persist anything on the device.
    files: ['packages/core/src/**', 'packages/react/src/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'The SDK must not persist data.' },
        { name: 'sessionStorage', message: 'The SDK must not persist data.' },
        { name: 'indexedDB', message: 'The SDK must not persist data.' },
        { name: 'caches', message: 'The SDK must not persist data.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage' },
        { object: 'window', property: 'sessionStorage' },
        { object: 'window', property: 'indexedDB' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}', 'apps/bench/**'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
);
