import type { OpenCvConfig } from '@doc-capture/core';
import manifest from '@doc-capture/opencv-build/manifest.json';

/** OpenCV settings for the self-hosted copy in public/opencv. */
export const opencv: OpenCvConfig = {
  baseUrl: `${import.meta.env.BASE_URL}opencv/`,
  variant: manifest.variant === 'custom' ? 'custom' : 'stock',
  integrity: manifest.files,
};
