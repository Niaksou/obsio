import type { Storage } from './storage.js';

// Le type déclaré à l'envoi n'est qu'une indication du navigateur : le contenu doit le confirmer
// par sa signature avant tout traitement (ASVS 5.2.2). Un fichier qui ne correspond pas est
// traité comme absent ; il n'est jamais lu ni servi.

/** Octets lus en tête de fichier : un PDF peut commencer par jusqu'à 1 024 octets parasites. */
const HEAD_BYTES = 1024;

const startsWith = (head: Buffer, bytes: number[], offset = 0) =>
  bytes.every((byte, index) => head[offset + index] === byte);

/** Type réel d'après la signature, parmi ceux qu'accepte Obsio, ou null. */
export function detectContentType(head: Buffer): string | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (
    head.subarray(0, 4).toString('latin1') === 'RIFF' &&
    head.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (head.subarray(0, HEAD_BYTES).includes('%PDF-', 0, 'latin1')) return 'application/pdf';
  return null;
}

/** Type déclaré de l'objet s'il existe et que son contenu le confirme, sinon null. */
export async function verifiedContentType(storage: Storage, key: string): Promise<string | null> {
  const declared = await storage.contentType(key);
  if (!declared) return null;
  const head = await storage.head(key, HEAD_BYTES);
  return head && detectContentType(head) === declared ? declared : null;
}
