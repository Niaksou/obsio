import {
  DOCUMENT_TYPE_LABELS,
  Q18_CONSTATATIONS,
  RESERVE_STATUS_LABELS,
  type ReserveDetail,
  type ReserveEvent,
  type ReserveUpdate,
} from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.js';
import { ConfirmButton } from '../components/ConfirmButton.js';
import { MutationError } from '../components/MutationError.js';
import { keys, useIsAdmin } from '../queries.js';
import { ProofForm } from '../reserves/ProofForm.js';
import { formatDateTime, formatDay, StatusLabel } from '../reserves/status.js';

export function ReservePage() {
  const reserveId = useParams().reserveId!;
  const reserve = useQuery({
    queryKey: keys.reserve(reserveId),
    queryFn: () => api.reserve(reserveId),
  });
  if (reserve.error) return <p className="error page-message">{reserve.error.message}</p>;
  if (!reserve.data) return <p className="loading page-message">Chargement…</p>;
  return <Reserve reserve={reserve.data} />;
}

function useRefresh(reserve: ReserveDetail) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: keys.reserve(reserve.id) });
    await queryClient.invalidateQueries({ queryKey: keys.siteReserves(reserve.siteId) });
  };
}

function Reserve({ reserve }: { reserve: ReserveDetail }) {
  const isAdmin = useIsAdmin();
  const site = useQuery({
    queryKey: keys.site(reserve.siteId),
    queryFn: () => api.site(reserve.siteId),
  });
  const [editing, setEditing] = useState(false);
  const open = reserve.status === 'ouverte' || reserve.status === 'assignee';

  return (
    <div className="page reserve-page">
      <p className="crumbs">
        <Link to="/">Sites</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/sites/${reserve.siteId}`}>{site.data?.name ?? 'Site'}</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/sites/${reserve.siteId}/reserves`}>Réserves</Link>
      </p>

      <header className="reserve-head">
        <StatusLabel status={reserve.status} overdue={reserve.overdue} />
        <h1>{reserve.description}</h1>
        <dl className="facts">
          <div>
            <dt>Équipement</dt>
            <dd>
              {reserve.equipment ? (
                <Link to={`/etages/${reserve.equipment.floorId}`}>
                  <span className="plate plate-small">{reserve.equipment.name}</span>{' '}
                  {reserve.equipment.buildingName}, {reserve.equipment.floorName}
                </Link>
              ) : (
                'Non rattaché'
              )}
            </dd>
          </div>
          <div>
            <dt>Échéance</dt>
            <dd className={reserve.overdue ? 'late' : undefined}>
              {reserve.dueDate ? formatDay(reserve.dueDate) : 'Aucune'}
            </dd>
          </div>
          <div>
            <dt>Intervenant</dt>
            <dd>
              {reserve.assignedTo
                ? `${reserve.assignedTo.name}${reserve.assignedTo.company ? `, ${reserve.assignedTo.company}` : ''}`
                : 'Non assignée'}
            </dd>
          </div>
          {reserve.gravite && (
            <div>
              <dt>Gravité</dt>
              <dd>{reserve.gravite}</dd>
            </div>
          )}
        </dl>
        {reserve.preconisation && (
          <p className="preconisation">
            <strong>Préconisation :</strong> {reserve.preconisation}
          </p>
        )}
        {isAdmin && reserve.status !== 'levee' && !editing && (
          <button type="button" className="quiet" onClick={() => setEditing(true)}>
            Modifier la réserve
          </button>
        )}
        {editing && <EditReserve reserve={reserve} onDone={() => setEditing(false)} />}
      </header>

      {isAdmin && reserve.status === 'corrigee' && <Review reserve={reserve} />}

      <section className="reserve-section">
        <h2>Preuves de correction</h2>
        {reserve.proofs.length === 0 && <p className="empty">Aucune preuve pour l’instant.</p>}
        <Proofs proofs={reserve.proofs} />
        {reserve.status !== 'levee' && (
          <details className="add-proof" open={reserve.proofs.length === 0 && open}>
            <summary>Ajouter une preuve</summary>
            <ProofForm target={{ kind: 'member', reserveId: reserve.id }} canMarkCorrected={open} />
          </details>
        )}
      </section>

      <section className="reserve-section">
        <h2>Rapports d’origine</h2>
        <ul className="sources">
          {reserve.sources.map((source) => (
            <li key={source.id}>
              <p className="row-title">
                {DOCUMENT_TYPE_LABELS[source.documentType]}, observation n° {source.reference}
              </p>
              <p className="row-meta">
                {source.organisme}
                {source.dateVisite && `, visite du ${formatDay(source.dateVisite)}`}
                {source.pageSource && `, page ${source.pageSource}`}
                {source.articleReglementaire && `, ${source.articleReglementaire}`}
              </p>
              <p>{source.description}</p>
              {source.localisationTexte && (
                <p className="row-meta">Localisation : {source.localisationTexte}</p>
              )}
              {source.constatationQ18 && (
                <p className="row-meta">
                  Constatation Q18 n° {source.constatationQ18} :{' '}
                  {Q18_CONSTATATIONS[source.constatationQ18]}
                </p>
              )}
              {isAdmin && <Link to={`/imports/${source.importId}`}>Voir l’import</Link>}
            </li>
          ))}
        </ul>
        {reserve.history.length > 0 && (
          <>
            <h3>Déjà relevée lors des vérifications précédentes</h3>
            <ul className="rows">
              {reserve.history.map((previous) => (
                <li key={previous.id}>
                  <Link to={`/reserves/${previous.id}`} className="row-link">
                    <span className="row-title">{previous.description}</span>
                    <span className="row-meta">
                      relevée le {formatDateTime(previous.createdAt)}
                    </span>
                    <span className="status">{RESERVE_STATUS_LABELS[previous.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {reserve.assignments.length > 0 && <Assignments reserve={reserve} isAdmin={isAdmin} />}

      <section className="reserve-section">
        <h2>Journal</h2>
        <ol className="journal">
          {reserve.events.map((event) => (
            <li key={event.id}>
              <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
              <p>
                {event.actor && <strong>{event.actor}</strong>} {describeEvent(event)}
              </p>
              {event.type === 'commentaire' && <blockquote>{String(event.data.text)}</blockquote>}
              {(event.type === 'levee' || event.type === 'correction_refusee') &&
                typeof event.data.comment === 'string' && (
                  <blockquote>{event.data.comment}</blockquote>
                )}
            </li>
          ))}
        </ol>
        <CommentForm reserve={reserve} />
      </section>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  description: 'la description',
  preconisation: 'la préconisation',
  gravite: 'la gravité',
  dueDate: 'l’échéance',
  equipmentId: 'l’équipement',
};

export function describeEvent(event: ReserveEvent): string {
  const data = event.data;
  switch (event.type) {
    case 'creee':
      return 'a activé la réserve depuis le rapport.';
    case 'reconduite':
      return 'a activé la réserve, reconduite du rapport précédent.';
    case 'modifiee':
      return `a modifié ${Object.keys(data)
        .map((key) => FIELD_LABELS[key] ?? key)
        .join(', ')}.`;
    case 'commentaire':
      return 'a commenté :';
    case 'assignee':
      return `a assigné la réserve à ${String(data.contractor ?? 'un intervenant')}${
        typeof data.dueDate === 'string' ? `, pour le ${formatDay(data.dueDate)}` : ''
      }.`;
    case 'assignation_revoquee':
      return 'a révoqué le lien de l’intervenant.';
    case 'preuve': {
      const photos = Number(data.photos ?? 0);
      return `a ajouté une preuve${photos ? ` (${photos} photo${photos > 1 ? 's' : ''})` : ''}.`;
    }
    case 'corrigee':
      return 'a indiqué la réserve corrigée.';
    case 'levee':
      return 'a levé la réserve.';
    case 'correction_refusee':
      return 'a refusé la correction :';
    default:
      return event.type;
  }
}

function Proofs({ proofs }: { proofs: ReserveDetail['proofs'] }) {
  if (proofs.length === 0) return null;
  return (
    <ul className="proofs">
      {proofs.map((proof) => (
        <li key={proof.id}>
          <p className="row-meta">
            <strong>{proof.author}</strong>, {formatDateTime(proof.createdAt)}
          </p>
          {proof.comment && <p>{proof.comment}</p>}
          {proof.photos.length > 0 && (
            <div className="photo-strip">
              {proof.photos.map((photo) => (
                <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer">
                  <img src={photo.url} alt="Photo de la correction" loading="lazy" />
                </a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Review({ reserve }: { reserve: ReserveDetail }) {
  const refresh = useRefresh(reserve);
  const [comment, setComment] = useState('');
  const review = useMutation({
    mutationFn: (decision: 'lever' | 'refuser') =>
      api.review(reserve.id, { decision, comment: comment.trim() || null }),
    onSuccess: refresh,
  });
  return (
    <section className="review-box" aria-label="Vérification de la correction">
      <h2>Correction à vérifier</h2>
      <p>
        Regardez les preuves ci-dessous. Levez la réserve si la correction est faite, sinon
        renvoyez-la à l’intervenant avec un commentaire.
      </p>
      <label>
        Commentaire (facultatif pour lever, conseillé pour refuser)
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <MutationError error={review.error} />
      <div className="panel-actions">
        <button type="button" disabled={review.isPending} onClick={() => review.mutate('lever')}>
          Lever la réserve
        </button>
        <button
          type="button"
          className="secondary"
          disabled={review.isPending}
          onClick={() => review.mutate('refuser')}
        >
          Refuser la correction
        </button>
      </div>
    </section>
  );
}

function Assignments({ reserve, isAdmin }: { reserve: ReserveDetail; isAdmin: boolean }) {
  const refresh = useRefresh(reserve);
  const revoke = useMutation({ mutationFn: api.revokeAssignment, onSuccess: refresh });
  const now = new Date().toISOString();
  return (
    <section className="reserve-section">
      <h2>Assignations</h2>
      <ul className="rows">
        {reserve.assignments.map((a) => {
          const state = a.revokedAt ? 'Révoquée' : a.expiresAt < now ? 'Lien expiré' : 'Lien actif';
          return (
            <li key={a.id} className="assignment-row">
              <span className="row-title">
                {a.contractor.name}
                {a.contractor.company && `, ${a.contractor.company}`}
              </span>
              <span className="row-meta">
                le {formatDateTime(a.createdAt)}
                {a.dueDate && `, pour le ${formatDay(a.dueDate)}`}
              </span>
              <span className="status">{state}</span>
              {isAdmin && state === 'Lien actif' && reserve.status !== 'levee' && (
                <ConfirmButton
                  label="Révoquer"
                  confirmLabel="Révoquer le lien"
                  disabled={revoke.isPending}
                  onConfirm={() => revoke.mutate(a.id)}
                />
              )}
            </li>
          );
        })}
      </ul>
      <MutationError error={revoke.error} />
    </section>
  );
}

function CommentForm({ reserve }: { reserve: ReserveDetail }) {
  const refresh = useRefresh(reserve);
  const [text, setText] = useState('');
  const send = useMutation({
    mutationFn: () => api.comment(reserve.id, text.trim()),
    onSuccess: async () => {
      setText('');
      await refresh();
    },
  });
  return (
    <form
      className="comment-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) send.mutate();
      }}
    >
      <label>
        Commentaire
        <textarea
          rows={2}
          value={text}
          maxLength={5000}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <MutationError error={send.error} />
      <button type="submit" className="secondary" disabled={!text.trim() || send.isPending}>
        Ajouter au journal
      </button>
    </form>
  );
}

function EditReserve({ reserve, onDone }: { reserve: ReserveDetail; onDone: () => void }) {
  const refresh = useRefresh(reserve);
  const equipment = useQuery({
    queryKey: keys.siteEquipment(reserve.siteId),
    queryFn: () => api.siteEquipment(reserve.siteId),
  });
  const update = useMutation({
    mutationFn: (input: ReserveUpdate) => api.updateReserve(reserve.id, input),
    onSuccess: async () => {
      await refresh();
      onDone();
    },
  });
  return (
    <form
      className="edit-reserve"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const text = (name: string) => String(data.get(name) ?? '').trim();
        update.mutate({
          description: text('description'),
          preconisation: text('preconisation') || null,
          dueDate: text('dueDate') || null,
          equipmentId: text('equipmentId') || null,
        });
      }}
    >
      <label>
        Description
        <textarea name="description" rows={3} required defaultValue={reserve.description} />
      </label>
      <label>
        Préconisation
        <textarea name="preconisation" rows={2} defaultValue={reserve.preconisation ?? ''} />
      </label>
      <div className="fields">
        <label>
          Équipement
          <select name="equipmentId" defaultValue={reserve.equipment?.id ?? ''}>
            <option value="">Non rattaché</option>
            {equipment.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.buildingName}, {item.floorName})
              </option>
            ))}
          </select>
        </label>
        <label className="date">
          Échéance
          <input name="dueDate" type="date" defaultValue={reserve.dueDate ?? ''} />
        </label>
      </div>
      <MutationError error={update.error} />
      <div className="panel-actions">
        <button type="submit" disabled={update.isPending || !equipment.data}>
          Enregistrer
        </button>
        <button type="button" className="quiet" onClick={onDone}>
          Annuler
        </button>
      </div>
    </form>
  );
}
