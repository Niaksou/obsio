import type { Intervention, InterventionReserve } from '@obsio/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api, ApiError } from '../api.js';
import { ProofForm } from '../reserves/ProofForm.js';
import { formatDateTime, formatDay, plural, StatusLabel } from '../reserves/status.js';
import { Logo } from '../components/Logo.js';
import { HelpButton } from '../tours/HelpButton.js';
import { Loading } from '../components/Loading.js';

// Vue de l'électricien, ouverte depuis le lien reçu par e-mail : pas de compte, pensée pour le
// téléphone, utilisable sans réseau une fois ouverte (dernière version gardée sur l'appareil).

const storageKey = (token: string) => `obsio:intervention:${token}`;

function readCached(token: string): Intervention | undefined {
  try {
    const raw = localStorage.getItem(storageKey(token));
    return raw ? (JSON.parse(raw) as Intervention) : undefined;
  } catch {
    return undefined;
  }
}

export function InterventionPage() {
  const token = useParams().token!;
  const intervention = useQuery({
    queryKey: ['intervention', token],
    queryFn: () => api.intervention(token),
    initialData: () => readCached(token),
    initialDataUpdatedAt: 0,
    retry: (count, error) => !(error instanceof ApiError) && count < 2,
  });
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!intervention.data || intervention.isFetching) return;
    try {
      localStorage.setItem(storageKey(token), JSON.stringify(intervention.data));
    } catch {
      // Stockage plein ou interdit : la vue marche, mais pas hors ligne.
    }
  }, [intervention.data, intervention.isFetching, token]);

  const refused =
    intervention.error instanceof ApiError && [404, 410].includes(intervention.error.status)
      ? intervention.error.message
      : null;

  useEffect(() => {
    // Un lien révoqué ou expiré ne doit plus rien laisser sur le téléphone.
    if (refused) localStorage.removeItem(storageKey(token));
  }, [refused, token]);

  return (
    <div className="intervention">
      <header className="intervention-head">
        <span className="brand">
          <Logo />
        </span>
        {intervention.data && <span>{intervention.data.organisationName}</span>}
        <HelpButton compact />
      </header>
      {!online && (
        <p className="offline-banner" role="status">
          Hors ligne : vos preuves sont gardées sur le téléphone et partiront au retour du réseau.
        </p>
      )}
      {refused && (
        <div className="intervention-body">
          <h1>Lien indisponible</h1>
          <p>{refused}</p>
        </div>
      )}
      {!refused && intervention.error && !intervention.data && (
        <p className="error page-message">{intervention.error.message}</p>
      )}
      {!intervention.data && intervention.isPending && <Loading page />}
      {intervention.data && !refused && <Assignment token={token} data={intervention.data} />}
    </div>
  );
}

function Assignment({ token, data }: { token: string; data: Intervention }) {
  const remaining = data.reserves.filter(
    (r) => r.status === 'ouverte' || r.status === 'assignee',
  ).length;
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="intervention-body">
      <h1>Bonjour {data.contractorName}</h1>
      <p>
        {data.organisationName} vous confie {plural(data.reserves.length, 'réserve')}
        {data.siteNames.length > 0 && ` sur ${data.siteNames.join(', ')}`}
        {data.dueDate && `, à corriger pour le ${formatDay(data.dueDate)}`}.
      </p>
      {data.message && <blockquote className="intervention-message">{data.message}</blockquote>}
      <p className="row-meta">
        {remaining === 0
          ? 'Toutes les réserves sont indiquées corrigées. Merci.'
          : `Reste ${plural(remaining, 'réserve')} à corriger. Prenez une photo après chaque correction.`}
      </p>

      <ol className="intervention-list">
        {data.reserves.map((reserve, index) => (
          <ReserveItem
            key={reserve.id}
            index={index + 1}
            reserve={reserve}
            token={token}
            open={openId === reserve.id}
            onToggle={() => setOpenId(openId === reserve.id ? null : reserve.id)}
          />
        ))}
      </ol>
      <p className="hint">Lien valable jusqu’au {formatDateTime(data.expiresAt)}.</p>
    </div>
  );
}

function ReserveItem({
  index,
  reserve,
  token,
  open,
  onToggle,
}: {
  index: number;
  reserve: InterventionReserve;
  token: string;
  open: boolean;
  onToggle: () => void;
}) {
  const toFix = reserve.status === 'ouverte' || reserve.status === 'assignee';
  return (
    <li className={open ? 'open' : undefined}>
      <button
        type="button"
        className="intervention-item"
        aria-expanded={open}
        data-tour="intervention-item"
        onClick={onToggle}
      >
        <span className="item-number">{index}</span>
        <span className="item-main">
          {reserve.equipment && (
            <span className="row-meta">
              <span className="plate plate-small">{reserve.equipment.name}</span>{' '}
              {reserve.equipment.buildingName}, {reserve.equipment.floorName}
            </span>
          )}
          <span className="item-text">{reserve.description}</span>
          <StatusLabel status={reserve.status} />
        </span>
      </button>
      {open && (
        <div className="item-detail">
          {reserve.localisation && (
            <p>
              <strong>Localisation :</strong> {reserve.localisation}
            </p>
          )}
          {reserve.preconisation && (
            <p>
              <strong>Préconisation :</strong> {reserve.preconisation}
            </p>
          )}
          {reserve.gravite && (
            <p>
              <strong>Gravité :</strong> {reserve.gravite}
            </p>
          )}
          {reserve.proofs.length > 0 && (
            <div className="sent-proofs">
              <h3>Déjà envoyé</h3>
              {reserve.proofs.map((proof) => (
                <div key={proof.id} className="sent-proof">
                  <p className="row-meta">{formatDateTime(proof.createdAt)}</p>
                  {proof.comment && <p>{proof.comment}</p>}
                  <div className="photo-strip">
                    {proof.photos.map((photo) => (
                      <img key={photo.url} src={photo.url} alt="Photo envoyée" loading="lazy" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {reserve.status === 'corrigee' && (
            <p className="hint">Correction envoyée : le responsable va la vérifier.</p>
          )}
          <ProofForm
            target={{ kind: 'intervention', token, reserveId: reserve.id }}
            canMarkCorrected={toFix}
          />
        </div>
      )}
    </li>
  );
}
