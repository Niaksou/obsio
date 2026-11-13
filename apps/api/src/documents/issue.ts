import { createHash, randomUUID } from 'node:crypto';
import { organisationPrefix, type DocumentType } from '@obsio/shared';
import type { Transaction } from '../db/client.js';
import { issuedDocument } from '../db/schema/index.js';
import { buildProofDossier } from '../reserves/dossier.js';
import type { Storage } from '../storage.js';
import type { DocumentSigner } from './signing.js';

// Émission d'un dossier de preuves : génération, signature, empreinte SHA-256 enregistrée et
// fichier gardé tel quel. Le registre (issued_document) n'est ni modifié ni supprimé par
// l'application : la page « Vérifier un document » s'y réfère.

export const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

export interface IssueOptions {
  organisation: { id: string; name: string };
  site: { id: string; name: string; address: string | null };
  user: { id: string; name: string };
  documentType?: DocumentType | undefined;
  scope: 'levees' | 'toutes';
  /** Adresse du front : la page publique de vérification y est servie. */
  webUrl: string;
}

export async function issueProofDossier(
  tx: Transaction,
  storage: Storage,
  signer: DocumentSigner,
  options: IssueOptions,
) {
  const id = randomUUID();
  const issuedAt = new Date();
  const dossier = await buildProofDossier(tx, storage, {
    organisationName: options.organisation.name,
    site: options.site,
    documentType: options.documentType,
    scope: options.scope,
    registration: { documentId: id, verifyUrl: `${options.webUrl.replace(/\/$/, '')}/verifier` },
    issuedBy: options.user.name,
    issuedAt,
  });
  const pdf = await signer.sign(dossier.pdf, {
    reason: `Dossier de preuves émis par ${options.organisation.name} avec Obsio`,
    location: options.site.name,
  });
  const storageKey = `${organisationPrefix(options.organisation.id)}documents/${id}.pdf`;
  await storage.put(storageKey, pdf, 'application/pdf');
  await tx.insert(issuedDocument).values({
    id,
    organisationId: options.organisation.id,
    kind: 'dossier_preuves',
    siteId: options.site.id,
    documentType: options.documentType ?? null,
    scope: options.scope,
    reserveCount: dossier.reserveCount,
    liftedCount: dossier.liftedCount,
    sha256: sha256(pdf),
    byteSize: pdf.length,
    storageKey,
    signerFingerprint: signer.fingerprint,
    issuedBy: options.user.id,
    issuedAt,
  });
  return { id, pdf, issuedAt };
}
