import { describe, expect, it } from 'vitest';
import { detectContentType, verifiedContentType } from '../src/file-signature.js';
import { buildTestApp } from './helpers.js';

const bytes = (...values: number[]) => Buffer.from(values);

describe('signature des fichiers', () => {
  it.each([
    ['image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)],
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['image/webp', Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1')],
    ['application/pdf', Buffer.from('%PDF-1.7\n')],
    // Octets parasites tolérés par les lecteurs PDF avant l'en-tête.
    ['application/pdf', Buffer.concat([Buffer.alloc(100, 0x20), Buffer.from('%PDF-1.4')])],
  ])('reconnaît %s', (type, head) => {
    expect(detectContentType(head)).toBe(type);
  });

  it.each([
    ['HTML', Buffer.from('<html><script>alert(1)</script>')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')],
    ['vide', Buffer.alloc(0)],
  ])('refuse un contenu %s', (_name, head) => {
    expect(detectContentType(head)).toBeNull();
  });

  it('refuse un fichier dont le contenu contredit le type déclaré', async () => {
    const ctx = await buildTestApp();
    try {
      const key = `essais/${crypto.randomUUID()}.png`;
      await ctx.storage.put(key, '<html>pas une image</html>', 'image/png');
      expect(await verifiedContentType(ctx.storage, key)).toBeNull();
      const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2);
      await ctx.storage.put(key, png, 'image/png');
      expect(await verifiedContentType(ctx.storage, key)).toBe('image/png');
      expect(await verifiedContentType(ctx.storage, `essais/${crypto.randomUUID()}`)).toBeNull();
    } finally {
      await ctx.close();
    }
  });
});
