import {
  PLAN_IMAGE_MAX_BYTES,
  PLAN_IMAGE_TYPES,
  PLAN_SOURCE_MAX_BYTES,
  type PlanUploadRequest,
} from '@obsio/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useState } from 'react';
import { api, uploadToStorage } from '../api.js';
import { keys } from '../queries.js';
import { imageFileToPlan, openPdf, pdfPageToImage, renderPage } from './rasterize.js';

const ACCEPT = ['application/pdf', ...PLAN_IMAGE_TYPES].join(',');
const MAX_MB = Math.round(PLAN_SOURCE_MAX_BYTES / 1024 / 1024);

type Step = 'idle' | 'converting' | 'sending';

interface Chosen {
  file: File;
  pdf: PDFDocumentProxy | null;
}

/**
 * Dépôt du plan d'un étage. Un PDF est converti en image dans le navigateur (page choisie
 * s'il en a plusieurs) ; le PDF d'origine est conservé à côté.
 */
export function PlanUpload({
  floorId,
  buildingId,
  replacing,
  onDone,
}: {
  floorId: string;
  buildingId: string;
  replacing: boolean;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [step, setStep] = useState<Step>('idle');

  const send = useMutation({
    mutationFn: async ({ file, pdf, page }: Chosen & { page: number }) => {
      setStep('converting');
      const image = pdf ? await pdfPageToImage(pdf, page) : await imageFileToPlan(file);
      if (image.blob.size > PLAN_IMAGE_MAX_BYTES) {
        throw new Error('Le plan converti est trop lourd. Essayez une autre page ou une image.');
      }
      setStep('sending');
      const request: PlanUploadRequest = {
        source: pdf ? { contentType: 'application/pdf', size: file.size } : null,
        image: {
          contentType: image.blob.type as PlanUploadRequest['image']['contentType'],
          size: image.blob.size,
        },
      };
      const posts = await api.planUploads(floorId, request);
      await Promise.all([
        uploadToStorage(posts.image, image.blob),
        posts.source && uploadToStorage(posts.source, file),
      ]);
      return api.confirmPlan(floorId, {
        imageKey: posts.image.key,
        sourceKey: posts.source?.key ?? null,
        width: image.width,
        height: image.height,
      });
    },
    onSuccess: async () => {
      setChosen(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.floor(floorId) }),
        queryClient.invalidateQueries({ queryKey: keys.floors(buildingId) }),
      ]);
      onDone?.();
    },
    onSettled: () => setStep('idle'),
  });

  const [fileError, setFileError] = useState<string | null>(null);

  async function choose(file: File) {
    setFileError(null);
    send.reset();
    if (file.size > PLAN_SOURCE_MAX_BYTES) {
      setFileError(`Ce fichier dépasse ${MAX_MB} Mo.`);
      return;
    }
    if (file.type === 'application/pdf') {
      try {
        const pdf = await openPdf(file);
        if (pdf.numPages === 1) send.mutate({ file, pdf, page: 1 });
        else setChosen({ file, pdf });
      } catch {
        setFileError(
          'Ce PDF ne peut pas être lu. Vérifiez qu’il n’est pas protégé par un mot de passe.',
        );
      }
      return;
    }
    if ((PLAN_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      send.mutate({ file, pdf: null, page: 1 });
      return;
    }
    setFileError('Format non pris en charge : déposez un PDF ou une image PNG, JPEG ou WebP.');
  }

  const busy = step !== 'idle';

  return (
    <div className="plan-upload">
      {!chosen && (
        <>
          <p>
            {replacing
              ? 'Le nouveau plan remplace l’actuel. Les équipements gardent leur position relative : vérifiez-les ensuite.'
              : 'Déposez le plan de l’étage : un PDF (page au choix) ou une image.'}
          </p>
          <label className="file-drop">
            <span>{busy ? stepLabel(step) : 'Choisir un fichier'}</span>
            <input
              type="file"
              accept={ACCEPT}
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void choose(file);
              }}
            />
          </label>
          <p className="hint">PDF, PNG, JPEG ou WebP, {MAX_MB} Mo au plus.</p>
        </>
      )}
      {chosen?.pdf && (
        <PagePicker
          pdf={chosen.pdf}
          busy={busy}
          status={stepLabel(step)}
          onPick={(page) => send.mutate({ ...chosen, page })}
          onCancel={() => setChosen(null)}
        />
      )}
      {(fileError ?? send.error) && (
        <p className="error" role="alert">
          {fileError ?? send.error?.message}
        </p>
      )}
    </div>
  );
}

function stepLabel(step: Step) {
  if (step === 'converting') return 'Conversion du plan…';
  if (step === 'sending') return 'Envoi du plan…';
  return '';
}

/** Vignettes des pages d'un PDF de plusieurs pages, pour choisir celle du plan. */
function PagePicker({
  pdf,
  busy,
  status,
  onPick,
  onCancel,
}: {
  pdf: PDFDocumentProxy;
  busy: boolean;
  status: string;
  onPick: (page: number) => void;
  onCancel: () => void;
}) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      for (let page = 1; page <= pdf.numPages && active; page++) {
        const canvas = await renderPage(pdf, page, 320);
        const url = canvas.toDataURL('image/png');
        if (active) setThumbnails((current) => [...current, url]);
      }
    })();
    return () => {
      active = false;
    };
  }, [pdf]);

  return (
    <div className="page-picker">
      <p>Ce PDF a {pdf.numPages} pages. Choisissez celle du plan.</p>
      <ul>
        {Array.from({ length: pdf.numPages }, (_, index) => (
          <li key={index}>
            <button
              type="button"
              className="page-thumb"
              disabled={busy || !thumbnails[index]}
              onClick={() => onPick(index + 1)}
            >
              {thumbnails[index] ? (
                <img src={thumbnails[index]} alt="" />
              ) : (
                <span className="page-thumb-blank" />
              )}
              <span>Page {index + 1}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="actions">
        {busy && <span className="status">{status}</span>}
        <button type="button" className="quiet" disabled={busy} onClick={onCancel}>
          Choisir un autre fichier
        </button>
      </div>
    </div>
  );
}
