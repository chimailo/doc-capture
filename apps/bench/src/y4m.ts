import { closeSync, openSync, writeSync } from 'node:fs';

/**
 * Minimal Y4M (YUV4MPEG2, 4:2:0) writer. Chrome's fake camera
 * (`--use-file-for-fake-video-capture`) plays these files in a loop.
 */
export class Y4mWriter {
  private fd: number;
  private y: Uint8Array;
  private u: Uint8Array;
  private v: Uint8Array;

  constructor(
    path: string,
    private width: number,
    private height: number,
    fps: number,
  ) {
    if (width % 2 || height % 2) throw new Error('Y4M 4:2:0 needs even dimensions');
    this.fd = openSync(path, 'w');
    writeSync(this.fd, `YUV4MPEG2 W${width} H${height} F${fps}:1 Ip A1:1 C420jpeg XCOLORRANGE=LIMITED\n`);
    this.y = new Uint8Array(width * height);
    this.u = new Uint8Array((width / 2) * (height / 2));
    this.v = new Uint8Array((width / 2) * (height / 2));
  }

  /**
   * Appends one RGBA frame as limited-range BT.601 (Y 16–235, UV 16–240),
   * which is how Chrome's fake camera interprets Y4M.
   */
  write(rgba: Uint8Array | Uint8ClampedArray): void {
    const { width: w, height: h, y, u, v } = this;
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      y[i] = 16 + (219 / 255) * (0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!);
    }
    const cw = w / 2;
    for (let cy = 0; cy < h / 2; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const) {
          const p = ((cy * 2 + dy) * w + cx * 2 + dx) * 4;
          r += rgba[p]!;
          g += rgba[p + 1]!;
          b += rgba[p + 2]!;
        }
        r /= 4;
        g /= 4;
        b /= 4;
        const k = 224 / 255;
        u[cy * cw + cx] = 128 + k * (-0.168736 * r - 0.331264 * g + 0.5 * b);
        v[cy * cw + cx] = 128 + k * (0.5 * r - 0.418688 * g - 0.081312 * b);
      }
    }
    writeSync(this.fd, 'FRAME\n');
    writeSync(this.fd, y);
    writeSync(this.fd, u);
    writeSync(this.fd, v);
  }

  close(): void {
    closeSync(this.fd);
  }
}
