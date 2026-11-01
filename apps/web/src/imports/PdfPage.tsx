import { Util, type PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { findHighlight } from './highlight.js';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Une page du rapport, à la largeur du conteneur, avec le passage de la réserve surligné.
 * Si le texte n'est pas retrouvé (PDF scanné, texte retouché), la page s'affiche sans surlignage.
 */
export function PdfPage({
  pdf,
  pageNumber,
  highlight,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  highlight: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [found, setFound] = useState<boolean | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry!.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width || !canvasRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    let task: { cancel(): void; promise: Promise<void> } | null = null;

    void (async () => {
      const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      task = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      try {
        await task.promise;
      } catch {
        return; // Rendu annulé par un changement de page ou de taille.
      }

      const content = await page.getTextContent();
      const items = content.items.filter((item) => 'str' in item);
      const indices = findHighlight(
        items.map((item) => item.str),
        highlight,
      );
      if (cancelled) return;
      setFound(indices.length > 0);
      setBoxes(
        indices.map((index) => {
          const item = items[index]!;
          const [, , c, d, x, y] = Util.transform(viewport.transform, item.transform);
          const height = Math.hypot(c!, d!);
          return { left: x!, top: y! - height, width: item.width * viewport.scale, height };
        }),
      );
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, highlight, width]);

  return (
    <div className="pdf-page" ref={containerRef}>
      <p className="pdf-page-label">
        Page {pageNumber}
        {found === false && ' : passage non retrouvé dans le texte de la page'}
      </p>
      <div className="pdf-page-sheet">
        <canvas ref={canvasRef} />
        {boxes.map((box, index) => (
          <span
            key={index}
            className="pdf-highlight"
            style={{
              left: box.left - 2,
              top: box.top - 2,
              width: box.width + 4,
              height: box.height + 4,
            }}
          />
        ))}
      </div>
    </div>
  );
}
