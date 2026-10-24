import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Conversion d'un plan en image dans le navigateur : le serveur ne manipule jamais de PDF.

GlobalWorkerOptions.workerSrc = workerUrl;

/** Côté le plus long de l'image produite : assez pour lire un plan, sous les limites mobiles. */
const MAX_SIDE = 4096;
/** Surface maximale d'un canevas sur iOS (environ 16,7 millions de pixels). */
const MAX_AREA = 16_000_000;

export interface PlanImage {
  blob: Blob;
  width: number;
  height: number;
}

export function openPdf(file: File): Promise<PDFDocumentProxy> {
  return file.arrayBuffer().then((data) => getDocument({ data }).promise);
}

/** Échelle de rendu pour que l'image tienne dans les limites, quelles que soient les proportions. */
export function renderScale(width: number, height: number, maxSide = MAX_SIDE): number {
  const bySide = maxSide / Math.max(width, height);
  const byArea = Math.sqrt(MAX_AREA / (width * height));
  return Math.min(bySide, byArea);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Conversion du plan en image impossible')),
      'image/png',
    ),
  );
}

/** Rend une page du PDF sur un canevas ; maxSide réduit la taille pour une vignette. */
export async function renderPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  maxSide = MAX_SIDE,
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: renderScale(base.width, base.height, maxSide) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  // Fond blanc : un PDF transparent donnerait un plan illisible sur fond sombre.
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

export async function pdfPageToImage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<PlanImage> {
  const canvas = await renderPage(pdf, pageNumber);
  return { blob: await canvasToBlob(canvas), width: canvas.width, height: canvas.height };
}

/** Image déposée telle quelle : on lit seulement ses dimensions. */
export async function imageFileToPlan(file: File): Promise<PlanImage> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { blob: file, ...size };
}
