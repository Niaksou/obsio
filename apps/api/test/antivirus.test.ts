import { createServer, type AddressInfo, type NetConnectOpts, type Server } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PresignedPost } from '@obsio/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { createClamavScanner, InfectedFile } from '../src/antivirus.js';
import { verifiedContentType } from '../src/file-signature.js';
import { buildTestApp, clientHelpers, EICAR, resetDatabase } from './helpers.js';

/** clamd simulé : relit le flux INSTREAM et répond comme ClamAV, en TCP ou sur une socket Unix. */
async function fakeClamd(
  socketPath?: string,
): Promise<{ address: NetConnectOpts; received: () => Buffer; server: Server }> {
  let received = Buffer.alloc(0);
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const command = 'zINSTREAM\0';
      if (buffer.length < command.length) return;
      let offset = command.length;
      const parts: Buffer[] = [];
      while (offset + 4 <= buffer.length) {
        const size = buffer.readUInt32BE(offset);
        if (size === 0) {
          received = Buffer.concat(parts);
          socket.end(
            received.includes(EICAR) ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0',
          );
          return;
        }
        if (offset + 4 + size > buffer.length) return;
        parts.push(buffer.subarray(offset + 4, offset + 4 + size));
        offset += 4 + size;
      }
    });
  });
  if (socketPath) {
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    return { address: { path: socketPath }, received: () => received, server };
  }
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { address: { host: '127.0.0.1', port }, received: () => received, server };
}

describe('client clamd', () => {
  it('envoie le fichier par morceaux et lit le verdict', async () => {
    const clamd = await fakeClamd();
    try {
      const scanner = createClamavScanner(clamd.address);
      const big = Buffer.alloc(200 * 1024, 7);
      expect(await scanner.scan(big)).toEqual({ infected: false });
      expect(clamd.received().equals(big)).toBe(true);
      expect(await scanner.scan(Buffer.from(`%PDF-1.7 ${EICAR}`))).toEqual({
        infected: true,
        signature: 'Eicar-Test-Signature',
      });
    } finally {
      clamd.server.close();
    }
  });

  it('joint clamd par sa socket Unix', async () => {
    const clamd = await fakeClamd(join(mkdtempSync(join(tmpdir(), 'clamd-')), 'clamd.sock'));
    try {
      const scanner = createClamavScanner(clamd.address);
      expect(await scanner.scan(Buffer.from(EICAR))).toMatchObject({ infected: true });
    } finally {
      clamd.server.close();
    }
  });

  it('échoue si clamd est injoignable', async () => {
    await expect(
      createClamavScanner({ host: '127.0.0.1', port: 1 }).scan(Buffer.from('x')),
    ).rejects.toThrow();
  });
});

describe('fichiers déposés', async () => {
  const ctx = await buildTestApp();
  const { openClient } = clientHelpers(ctx);
  afterAll(() => ctx.close());

  it('un fichier infecté est supprimé du stockage', async () => {
    const key = `essais/${crypto.randomUUID()}.pdf`;
    await ctx.storage.put(key, `%PDF-1.7 ${EICAR}`, 'application/pdf');
    await expect(verifiedContentType(ctx, key)).rejects.toThrow(InfectedFile);
    expect(await ctx.storage.contentType(key)).toBeNull();
  });

  it('un rapport infecté est refusé avant toute analyse', async () => {
    await resetDatabase();
    const { admin } = await openClient('Usine', 'Alice', 'alice@example.org');
    const siteId = (await admin.post('/api/sites', { name: 'Usine de Lyon' })).json().id;
    const post = (
      await admin.post(`/api/sites/${siteId}/imports/upload`, { fileName: 'r.pdf', size: 100 })
    ).json() as PresignedPost;
    const form = new FormData();
    for (const [name, value] of Object.entries(post.fields)) form.append(name, value);
    form.append('file', new Blob([`%PDF-1.7 ${EICAR}`], { type: 'application/pdf' }));
    expect((await fetch(post.url, { method: 'POST', body: form })).ok).toBe(true);

    const created = await admin.post(`/api/sites/${siteId}/imports`, {
      key: post.key,
      fileName: 'rapport.pdf',
    });
    expect(created.statusCode).toBe(422);
    expect(created.json().message).toBe(
      'Fichier refusé : l’antivirus y a détecté un logiciel malveillant.',
    );
    expect(ctx.queue.jobs).toHaveLength(0);
  });
});
