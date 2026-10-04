import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/out');
