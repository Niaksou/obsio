import { PROOF_MAX_PHOTOS } from '@obsio/shared';
import { useEffect, useId, useRef, useState } from 'react';
import {
  discardProof,
  enqueueProof,
  flushProofs,
  useQueuedProofs,
  type ProofTarget,
} from '../offline/proofQueue.js';
import { preparePhoto } from './photos.js';

interface Picked {
  id: string;
  blob: Blob;
  url: string;
}

/**
 * Preuve de correction : photos prises sur place, commentaire, et « corrigée ». La preuve part
 * par la file d'envoi : sans réseau, elle reste sur le téléphone et part au retour du réseau.
 */
export function ProofForm({
  target,
  canMarkCorrected,
}: {
  target: ProofTarget;
  canMarkCorrected: boolean;
}) {
  const inputId = useId();
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [comment, setComment] = useState('');
  // Coché par défaut ; ne compte que si la réserve peut encore passer « corrigée ».
  const [markCorrected, setMarkCorrected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const queued = useQueuedProofs().filter((item) => item.target.reserveId === target.reserveId);

  // Les aperçus sont libérés quand on retire la photo ou qu'on quitte l'écran.
  const previews = useRef(photos);
  useEffect(() => {
    previews.current = photos;
  }, [photos]);
  useEffect(() => () => previews.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  function clearPhotos(keep: (photo: Picked) => boolean) {
    setPhotos((current) => {
      current.filter((photo) => !keep(photo)).forEach((photo) => URL.revokeObjectURL(photo.url));
      return current.filter(keep);
    });
  }

  async function addFiles(files: FileList) {
    setError(null);
    setPreparing(true);
    try {
      const room = PROOF_MAX_PHOTOS - photos.length;
      const picked = await Promise.all(
        [...files].slice(0, room).map(async (file) => {
          const blob = await preparePhoto(file);
          return { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) };
        }),
      );
      setPhotos((current) => [...current, ...picked]);
      if (files.length > room) setError(`${PROOF_MAX_PHOTOS} photos au plus par envoi.`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPreparing(false);
    }
  }

  async function submit() {
    if (photos.length === 0 && !comment.trim()) {
      setError('Ajoutez une photo ou un commentaire.');
      return;
    }
    await enqueueProof({
      target,
      comment: comment.trim() || null,
      markCorrected: canMarkCorrected && markCorrected,
      photos: photos.map((photo) => photo.blob),
    });
    clearPhotos(() => false);
    setComment('');
    setError(null);
  }

  return (
    <div className="proof-form">
      {queued.map((item) => (
        <p
          key={item.clientId}
          className={item.error ? 'queued queued-error' : 'queued'}
          role="status"
        >
          {item.error ? (
            <>
              Preuve refusée : {item.error}{' '}
              <button
                type="button"
                className="link"
                onClick={() => void discardProof(item.clientId)}
              >
                Retirer du téléphone
              </button>
            </>
          ) : (
            <>
              Preuve en attente d’envoi ({item.photos.length} photo
              {item.photos.length > 1 ? 's' : ''}). Elle part dès que le réseau revient.{' '}
              <button type="button" className="link" onClick={() => void flushProofs()}>
                Réessayer maintenant
              </button>
            </>
          )}
        </p>
      ))}

      <div className="photo-strip">
        {photos.map((photo) => (
          <figure key={photo.id}>
            <img src={photo.url} alt="Photo de la correction" />
            <button
              type="button"
              className="quiet"
              aria-label="Retirer cette photo"
              onClick={() => clearPhotos((p) => p.id !== photo.id)}
            >
              Retirer
            </button>
          </figure>
        ))}
        <input
          id={inputId}
          className="visually-hidden"
          type="file"
          accept="image/*"
          multiple
          disabled={preparing}
          onChange={(event) => {
            const files = event.target.files;
            if (files?.length) void addFiles(files);
            event.target.value = '';
          }}
        />
        {photos.length < PROOF_MAX_PHOTOS && (
          <label htmlFor={inputId} className="photo-add">
            {preparing ? 'Préparation…' : photos.length ? 'Autre photo' : 'Prendre une photo'}
          </label>
        )}
      </div>

      <label>
        Commentaire
        <textarea
          rows={3}
          value={comment}
          maxLength={5000}
          placeholder="Ce qui a été fait, le matériel posé…"
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      {canMarkCorrected && (
        <label className="check">
          <input
            type="checkbox"
            checked={markCorrected}
            onChange={(event) => setMarkCorrected(event.target.checked)}
          />
          La réserve est corrigée
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" disabled={preparing} onClick={() => void submit()}>
        {canMarkCorrected && markCorrected ? 'Envoyer et indiquer corrigée' : 'Envoyer la preuve'}
      </button>
    </div>
  );
}
