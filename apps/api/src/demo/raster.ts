import { deflateSync } from 'node:zlib';

// Petites images de démonstration (plans, photos de preuve) dessinées sans dépendance :
// des rectangles sur une toile RVB, encodée en PNG.

export type Color = [number, number, number];

export function hex(value: string): Color {
  const n = Number.parseInt(value.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Canvas {
  readonly pixels: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    background: Color,
  ) {
    this.pixels = new Uint8Array(width * height * 3);
    this.fill(0, 0, width, height, background);
  }

  /** Rectangle plein, rogné aux bords de la toile. */
  fill(x: number, y: number, w: number, h: number, color: Color) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let row = y0; row < y1; row++) {
      for (let col = x0; col < x1; col++) {
        const i = (row * this.width + col) * 3;
        this.pixels[i] = color[0];
        this.pixels[i + 1] = color[1];
        this.pixels[i + 2] = color[2];
      }
    }
  }

  /** Contour d'un rectangle, d'épaisseur `thickness` vers l'intérieur. */
  stroke(x: number, y: number, w: number, h: number, thickness: number, color: Color) {
    this.fill(x, y, w, thickness, color);
    this.fill(x, y + h - thickness, w, thickness, color);
    this.fill(x, y, thickness, h, color);
    this.fill(x + w - thickness, y, thickness, h, color);
  }

  png(): Buffer {
    // Chaque ligne commence par l'octet de filtre (0 : aucun).
    const stride = this.width * 3;
    const raw = Buffer.alloc((stride + 1) * this.height);
    for (let row = 0; row < this.height; row++) {
      raw[row * (stride + 1)] = 0;
      raw.set(this.pixels.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(this.width, 0);
    header.writeUInt32BE(this.height, 4);
    header[8] = 8; // bits par composante
    header[9] = 2; // RVB
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
