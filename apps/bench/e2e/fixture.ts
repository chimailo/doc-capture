import { join } from 'node:path';
import { FIXTURE_DIR } from '../src/paths';

/** Default camera video for e2e tests. */
export const FIXTURE = join(FIXTURE_DIR, process.env.E2E_FIXTURE ?? 'enter-settle-dark') + '.y4m';
