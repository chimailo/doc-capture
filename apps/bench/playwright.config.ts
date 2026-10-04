import { defineConfig } from '@playwright/test';
import { FIXTURE } from './e2e/fixture';

/** Browser tests against the built demo, with a Y4M fixture as the camera. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    permissions: ['camera'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-video-capture=${FIXTURE}`,
      ],
    },
  },
  webServer: {
    command: 'pnpm --filter @doc-capture/demo preview',
    url: 'http://localhost:4173/bench.html',
    reuseExistingServer: !process.env.CI,
    cwd: '../..',
  },
});
