import type { OutputFormat } from '../types';

export const MIME: Record<OutputFormat, string> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  png: 'image/png',
};

/** Raw RGBA pixels, used when the worker cannot encode (no OffscreenCanvas). */
export interface RawImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Encodes RGBA pixels with the browser's canvas encoder. Canvas encoders never
 * write EXIF, so the output has no location, device or timestamp metadata.
 */
export async function encodePixels(
  img: RawImage,
  format: OutputFormat,
  quality: number,
): Promise<Blob> {
  const imageData = new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: MIME[format], quality });
    clearCanvas(canvas);
    return blob;
  }
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d')!.putImageData(imageData, 0, 0);
  try {
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Encoding failed'))),
        MIME[format],
        quality,
      ),
    );
  } finally {
    clearCanvas(canvas);
  }
}

/** Wipes a canvas and shrinks it so its backing store is released. */
export function clearCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): void {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
}
