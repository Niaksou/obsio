import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as apiModule from '../api.js';
import { api, ApiError, uploadToStorage } from '../api.js';
import {
  discardProof,
  enqueueProof,
  flushProofs,
  onProofSent,
  type QueuedProof,
} from './proofQueue.js';

vi.mock('../api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof apiModule>()),
  api: {
    interventionPhotoUpload: vi.fn(),
    interventionProof: vi.fn(),
    reservePhotoUpload: vi.fn(),
    addProof: vi.fn(),
  },
  uploadToStorage: vi.fn(),
}));

const mocked = vi.mocked(api);
const upload = vi.mocked(uploadToStorage);
const target = { kind: 'intervention' as const, token: 'jeton', reserveId: 'r1' };
const offline = () => new TypeError('Failed to fetch');

/** Contenu de la file, relu dans IndexedDB comme après un redémarrage du téléphone. */
async function stored(): Promise<QueuedProof[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('obsio', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const all = await new Promise<QueuedProof[]>((resolve) => {
    const request = db.transaction('proofs').objectStore('proofs').getAll();
    request.onsuccess = () => resolve(request.result as QueuedProof[]);
  });
  db.close();
  return all;
}

afterEach(() => vi.clearAllMocks());

describe('file d’envoi des preuves', () => {
  it('garde la preuve sans réseau, puis l’envoie une seule fois sans renvoyer la photo', async () => {
    let key = 0;
    mocked.interventionPhotoUpload.mockImplementation(async () => ({
      key: `photo-${++key}`,
      url: 'http://stockage',
      fields: {},
    }));
    upload.mockResolvedValueOnce(undefined); // première photo envoyée…
    upload.mockRejectedValueOnce(offline()); // …puis coupure sur la seconde
    const sent = vi.fn();
    const stop = onProofSent(sent);

    await enqueueProof({
      target,
      comment: 'DDR posé',
      markCorrected: true,
      photos: [new Blob(['a'], { type: 'image/jpeg' }), new Blob(['b'], { type: 'image/jpeg' })],
    });
    await flushProofs();
    let queue = await stored();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.keys).toEqual(['photo-1', null]);
    expect(mocked.interventionProof).not.toHaveBeenCalled();

    // Retour du réseau : seule la seconde photo part, puis la preuve, avec le même clientId.
    upload.mockResolvedValue(undefined);
    mocked.interventionProof.mockResolvedValue(null);
    await flushProofs();
    expect(upload).toHaveBeenCalledTimes(3);
    expect(mocked.interventionProof).toHaveBeenCalledWith('jeton', 'r1', {
      clientId: queue[0]!.clientId,
      comment: 'DDR posé',
      photoKeys: ['photo-1', 'photo-3'],
      markCorrected: true,
    });
    expect(sent).toHaveBeenCalledOnce();
    queue = await stored();
    expect(queue).toEqual([]);
    stop();
  });

  it('met de côté une preuve refusée (lien expiré) au lieu de la renvoyer sans fin', async () => {
    mocked.interventionProof.mockRejectedValue(new ApiError(410, 'Ce lien n’est plus valable.'));
    await enqueueProof({ target, comment: 'Fait', markCorrected: false, photos: [] });
    await flushProofs();
    await flushProofs();
    expect(mocked.interventionProof).toHaveBeenCalledOnce();
    const [refused] = await stored();
    expect(refused!.error).toBe('Ce lien n’est plus valable.');

    await discardProof(refused!.clientId);
    expect(await stored()).toEqual([]);
  });
});
