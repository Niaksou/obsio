import { useSyncExternalStore } from 'react';
import { api, ApiError, uploadToStorage } from '../api.js';

// File d'envoi des preuves : chaque preuve est d'abord rangée dans IndexedDB (photos comprises),
// puis envoyée dès que le réseau le permet. Le clientId choisi ici rend le renvoi sans danger :
// l'API ignore une preuve déjà reçue.

export type ProofTarget =
  | { kind: 'member'; reserveId: string }
  | { kind: 'intervention'; token: string; reserveId: string };

export interface QueuedProof {
  clientId: string;
  target: ProofTarget;
  comment: string | null;
  markCorrected: boolean;
  photos: Blob[];
  /** Clé de stockage de chaque photo déjà envoyée, pour ne pas la renvoyer. */
  keys: (string | null)[];
  createdAt: string;
  /** Refus définitif de l'API (lien expiré, réserve levée…) : la preuve attend une décision. */
  error: string | null;
}

const DB_NAME = 'obsio';
const STORE = 'proofs';
const RETRY_MS = 30_000;

let items: QueuedProof[] = [];
let loaded: Promise<void> | null = null;
let flushing: Promise<void> | null = null;
const listeners = new Set<() => void>();
const sentListeners = new Set<(proof: QueuedProof) => void>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'clientId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = fn(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

function emit() {
  items = [...items];
  for (const listener of listeners) listener();
}

function load() {
  loaded ??= withStore('readonly', (store) => store.getAll() as IDBRequest<QueuedProof[]>)
    .then((stored) => {
      items = stored.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      emit();
    })
    .catch(() => {
      // IndexedDB indisponible (navigation privée) : la file ne vit qu'en mémoire.
    });
  return loaded;
}

async function save(item: QueuedProof) {
  await withStore('readwrite', (store) => store.put(item)).catch(() => undefined);
}

async function remove(clientId: string) {
  items = items.filter((item) => item.clientId !== clientId);
  emit();
  await withStore('readwrite', (store) => store.delete(clientId)).catch(() => undefined);
}

function uploadRequest(target: ProofTarget, photo: Blob) {
  const input = { contentType: photo.type, size: photo.size };
  return target.kind === 'member'
    ? api.reservePhotoUpload(target.reserveId, input)
    : api.interventionPhotoUpload(target.token, { reserveId: target.reserveId, ...input });
}

async function send(item: QueuedProof) {
  for (const [index, photo] of item.photos.entries()) {
    if (item.keys[index]) continue;
    const post = await uploadRequest(item.target, photo);
    await uploadToStorage(post, photo);
    item.keys[index] = post.key;
    await save(item);
  }
  const input = {
    clientId: item.clientId,
    comment: item.comment,
    photoKeys: item.keys.filter((key): key is string => !!key),
    markCorrected: item.markCorrected,
  };
  const { target } = item;
  if (target.kind === 'member') await api.addProof(target.reserveId, input);
  else await api.interventionProof(target.token, target.reserveId, input);
}

/** Un refus 4xx ne passera pas en réessayant ; une coupure ou une erreur serveur, si. */
function isFinal(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

/** Envoie les preuves en attente, dans l'ordre ; s'arrête à la première coupure. */
export function flushProofs(): Promise<void> {
  flushing ??= (async () => {
    await load();
    for (const item of items.filter((candidate) => !candidate.error)) {
      try {
        await send(item);
        await remove(item.clientId);
        for (const listener of sentListeners) listener(item);
      } catch (error) {
        if (!isFinal(error)) break;
        item.error = (error as Error).message;
        await save(item);
        emit();
      }
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export async function enqueueProof(
  proof: Omit<QueuedProof, 'clientId' | 'keys' | 'createdAt' | 'error'>,
) {
  await load();
  const item: QueuedProof = {
    ...proof,
    clientId: crypto.randomUUID(),
    keys: proof.photos.map(() => null),
    createdAt: new Date().toISOString(),
    error: null,
  };
  items.push(item);
  emit();
  await save(item);
  void flushProofs();
}

/** Renonce à une preuve refusée : elle est retirée du téléphone. */
export function discardProof(clientId: string) {
  return remove(clientId);
}

/** Prévient quand une preuve est arrivée (pour rafraîchir l'écran concerné). */
export function onProofSent(listener: (proof: QueuedProof) => void) {
  sentListeners.add(listener);
  return () => {
    sentListeners.delete(listener);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void load();
  return () => {
    listeners.delete(listener);
  };
}

/** Preuves encore sur le téléphone. */
export function useQueuedProofs(): QueuedProof[] {
  return useSyncExternalStore(subscribe, () => items);
}

/** Relance la file au retour du réseau, et régulièrement tant qu'il reste des envois. */
export function startProofQueue() {
  if (typeof indexedDB === 'undefined') return;
  window.addEventListener('online', () => void flushProofs());
  window.setInterval(() => {
    if (navigator.onLine && items.some((item) => !item.error)) void flushProofs();
  }, RETRY_MS);
  void flushProofs();
}
