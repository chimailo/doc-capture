import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          root: 'packages/core',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'react',
          root: 'packages/react',
          environment: 'jsdom',
          include: ['test/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'demo',
          root: 'apps/demo',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'bench',
          root: 'apps/bench',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
    ],
  },
});
