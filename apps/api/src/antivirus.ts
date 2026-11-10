import { connect, type NetConnectOpts } from 'node:net';

// Antivirus des fichiers déposés (ASVS 5.4.3) : chaque rapport, plan ou photo est analysé par
// ClamAV (service clamd, protocole INSTREAM) avant tout traitement. Si clamd est injoignable,
// le dépôt est refusé.

export type ScanResult = { infected: false } | { infected: true; signature: string };

export interface FileScanner {
  scan(data: Buffer): Promise<ScanResult>;
}

/** Fichier refusé par l'antivirus : réponse 422 par le gestionnaire d'erreurs (`errors.ts`). */
export class InfectedFile extends Error {
  readonly statusCode = 422;
  constructor(readonly signature: string) {
    super('Fichier refusé : l’antivirus y a détecté un logiciel malveillant.');
  }
}

/** Morceaux envoyés à clamd, sous sa limite StreamMaxLength découpée en blocs. */
const CHUNK_BYTES = 64 * 1024;

/** clamd joint par TCP (`{ host, port }`) ou par sa socket Unix (`{ path }`). */
export function createClamavScanner(address: NetConnectOpts, timeoutMs = 60_000): FileScanner {
  return {
    scan: (data) =>
      new Promise((resolve, reject) => {
        const socket = connect(address);
        let reply = '';
        socket.setTimeout(timeoutMs, () => socket.destroy(new Error('Antivirus : délai dépassé')));
        socket.on('error', reject);
        socket.on('data', (chunk) => (reply += chunk.toString('latin1')));
        socket.on('end', () => {
          // Réponses : « stream: OK », « stream: <signature> FOUND » ou « ... ERROR ».
          const line = reply.replace(/\0/g, '').trim();
          const found = /^stream: (.+) FOUND$/.exec(line);
          if (line === 'stream: OK') resolve({ infected: false });
          else if (found) resolve({ infected: true, signature: found[1]! });
          else reject(new Error(`Antivirus : réponse inattendue « ${line} »`));
        });
        socket.on('connect', () => {
          socket.write('zINSTREAM\0');
          for (let offset = 0; offset < data.length; offset += CHUNK_BYTES) {
            const chunk = data.subarray(offset, offset + CHUNK_BYTES);
            const size = Buffer.alloc(4);
            size.writeUInt32BE(chunk.length);
            socket.write(size);
            socket.write(chunk);
          }
          socket.end(Buffer.alloc(4));
        });
      }),
  };
}

/** Développement et tests sans ClamAV : aucun fichier n'est analysé (refusé en production). */
export const noScanner: FileScanner = { scan: async () => ({ infected: false }) };
