import { PROOF_PHOTO_MAX_BYTES, PROOF_PHOTO_TYPES } from '@obsio/shared';

/** Côté le plus long d'une photo de preuve : assez pour lire une étiquette, léger sur le réseau. */
const MAX_SIDE = 2000;

/**
 * Réduit une photo de téléphone avant l'envoi (souvent 4 à 8 Mo). Si le navigateur ne sait pas
 * la décoder, on garde le fichier d'origine tant qu'il respecte les limites.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (blob) return blob;
  } catch {
    // Format non décodable ici (HEIC sur certains navigateurs) : on tente l'original.
  }
  if (!(PROOF_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Format de photo non pris en charge : utilisez JPEG ou PNG.');
  }
  if (file.size > PROOF_PHOTO_MAX_BYTES) throw new Error('Cette photo est trop lourde.');
  return file;
}
