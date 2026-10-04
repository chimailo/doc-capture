import type { OcrPlugin } from '@doc-capture/ocr-types';
import { RemotePluginNotAllowed } from './errors';

/**
 * Refuses plugins that send data off the device unless the host opted in.
 * Throws {@link RemotePluginNotAllowed}.
 */
export function assertPluginsAllowed(plugins: readonly OcrPlugin[], allowRemote: boolean): void {
  for (const p of plugins) {
    if (p.runsOnDevice !== true && !allowRemote) throw new RemotePluginNotAllowed(p.id);
  }
}
