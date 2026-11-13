import { z } from 'zod';

// Documents émis (dossiers de preuves signés) et leur vérification publique.

/** Empreinte SHA-256 d'un fichier, calculée dans le navigateur : le PDF n'est pas envoyé. */
export const documentVerifyInputSchema = z.object({
  sha256: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'empreinte SHA-256 en hexadécimal')
    .transform((value) => value.toLowerCase()),
});
export type DocumentVerifyInput = z.input<typeof documentVerifyInputSchema>;

/** Ce que la page publique montre d'un document reconnu : le strict minimum. */
export const documentVerificationSchema = z.object({
  number: z.string(),
  issuedAt: z.iso.datetime(),
  organisationName: z.string(),
  reserveCount: z.number().int().nonnegative(),
  liftedCount: z.number().int().nonnegative(),
});
export type DocumentVerification = z.infer<typeof documentVerificationSchema>;
