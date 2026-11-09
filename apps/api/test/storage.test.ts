import { afterAll, describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers.js';

const ctx = await buildTestApp();
afterAll(() => ctx.close());

describe('liens de lecture du stockage', () => {
  it('servent un PDF en pièce jointe, une image telle quelle', async () => {
    const base = `essais/${crypto.randomUUID()}`;
    await ctx.storage.put(`${base}/rapport.pdf`, '%PDF-1.7', 'application/pdf');
    await ctx.storage.put(`${base}/photo.png`, 'png', 'image/png');

    const pdf = await fetch(await ctx.storage.signedDownloadUrl(`${base}/rapport.pdf`));
    expect(pdf.headers.get('content-disposition')).toBe('attachment; filename="rapport.pdf"');
    const image = await fetch(await ctx.storage.signedDownloadUrl(`${base}/photo.png`));
    expect(image.ok).toBe(true);
    expect(image.headers.get('content-disposition')).toBeNull();
  });
});
