import {
  DOCUMENT_TYPE_LABELS,
  IMPORT_STATUS_LABELS,
  type DraftDecision,
  type DraftReserve,
  type DraftUpdate,
  type ReportDocument,
  type ReportImportDetail,
  type SiteEquipment,
} from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.js';
import { MutationError } from '../components/MutationError.js';
import { formatDate } from '../imports/ImportsSection.js';
import { PdfPage } from '../imports/PdfPage.js';
import { openPdfUrl } from '../plan/rasterize.js';
import { keys, useIsAdmin } from '../queries.js';
import { Loading } from '../components/Loading.js';

const ANALYSIS_POLL_MS = 3000;
/** En dessous, la réserve est mise en avant à la relecture (spec, étape 7). */
const LOW_CONFIDENCE = 0.8;

const DECISION_LABELS: Record<DraftDecision, string> = {
  a_valider: 'À relire',
  retenue: 'Retenue',
  ecartee: 'Écartée',
};

export function ImportPage() {
  const importId = useParams().importId!;
  const detail = useQuery({
    queryKey: keys.importDetail(importId),
    queryFn: () => api.importDetail(importId),
    refetchInterval: (query) =>
      query.state.data?.status === 'en_analyse' ? ANALYSIS_POLL_MS : false,
    // Le lien du PDF est signé pour 15 minutes.
    staleTime: 5 * 60 * 1000,
  });

  if (detail.error) return <p className="error page-message">{detail.error.message}</p>;
  if (!detail.data) return <Loading page />;
  return <ImportReview detail={detail.data} />;
}

/** Le PDF n'est ouvert qu'une fois, même quand le lien signé est renouvelé. */
function usePdf(url: string) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [opened] = useState(url);
  useEffect(() => {
    let document: PDFDocumentProxy | null = null;
    openPdfUrl(opened).then(
      (loaded) => {
        document = loaded;
        setPdf(loaded);
      },
      () => setError(true),
    );
    return () => void document?.cleanup();
  }, [opened]);
  return { pdf, error };
}

function ImportReview({ detail }: { detail: ReportImportDetail }) {
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const site = useQuery({
    queryKey: keys.site(detail.siteId),
    queryFn: () => api.site(detail.siteId),
  });
  const equipment = useQuery({
    queryKey: keys.siteEquipment(detail.siteId),
    queryFn: () => api.siteEquipment(detail.siteId),
  });
  const { pdf, error: pdfError } = usePdf(detail.pdfUrl);
  const [selectedId, setSelectedId] = useState<string | null>(detail.drafts[0]?.id ?? null);
  const selected = detail.drafts.find((draft) => draft.id === selectedId) ?? null;
  const editable = isAdmin && detail.status === 'a_valider';
  const pending = detail.drafts.filter((draft) => draft.decision === 'a_valider').length;

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.importDetail(detail.id) });
  const validate = useMutation({
    mutationFn: () => api.validateImport(detail.id),
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: keys.imports(detail.siteId) });
    },
  });
  const retry = useMutation({ mutationFn: () => api.retryImport(detail.id), onSuccess: refresh });

  return (
    <div className="review">
      <div className="toolbar">
        <p className="crumbs">
          <Link to="/">Sites</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/sites/${detail.siteId}`}>{site.data?.name ?? 'Site'}</Link>
        </p>
        <h1>{detail.fileName}</h1>
        <span className={`status status-${detail.status}`}>
          {IMPORT_STATUS_LABELS[detail.status]}
        </span>
        <div className="tools">
          {editable && (
            <>
              <span className="row-meta">
                {pending > 0
                  ? `${pending} réserve${pending > 1 ? 's' : ''} à relire`
                  : 'Toutes les réserves sont relues'}
              </span>
              <button
                type="button"
                disabled={pending > 0 || validate.isPending}
                data-tour="import-validate"
                onClick={() => validate.mutate()}
              >
                Valider l’import
              </button>
            </>
          )}
        </div>
      </div>
      <MutationError error={validate.error} />

      {detail.status === 'en_analyse' && (
        <div className="review-message">
          <h2>Analyse en cours</h2>
          <p>
            Le rapport est lu et ses réserves extraites. Comptez de quelques dizaines de secondes à
            quelques minutes ; cette page se met à jour toute seule.
          </p>
        </div>
      )}
      {detail.status === 'erreur' && (
        <div className="review-message">
          <h2>L’analyse a échoué</h2>
          <p className="error">{detail.error}</p>
          {isAdmin && (
            <button type="button" disabled={retry.isPending} onClick={() => retry.mutate()}>
              Relancer l’analyse
            </button>
          )}
          <MutationError error={retry.error} />
        </div>
      )}

      {(detail.status === 'a_valider' || detail.status === 'valide') && (
        <div className="review-body">
          <div className="review-list">
            {detail.status === 'valide' && detail.validatedAt && (
              <p className="review-note">
                Import validé le {formatDate(detail.validatedAt)} : {detail.reserveCount} réserve
                {detail.reserveCount > 1 ? 's' : ''} activée{detail.reserveCount > 1 ? 's' : ''}.
              </p>
            )}
            {detail.drafts.length === 0 && <p className="empty">Aucune réserve dans ce rapport.</p>}
            {detail.documents.map((document) => (
              <DocumentDrafts
                key={document.id}
                document={document}
                drafts={detail.drafts.filter((draft) => draft.documentId === document.id)}
                equipment={equipment.data ?? []}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </div>
          <div className="review-side">
            {selected && (
              <DraftEditor
                key={selected.id}
                draft={selected}
                detail={detail}
                equipment={equipment.data ?? []}
                editable={editable}
                onSaved={(next) => {
                  void refresh();
                  if (next) setSelectedId(nextPending(detail.drafts, selected.id) ?? selected.id);
                }}
              />
            )}
            <div className="review-pdf" data-tour="review-pdf">
              {pdfError && <p className="error">Le PDF du rapport n’a pas pu être ouvert.</p>}
              {pdf && selected && (
                <PdfPage
                  pdf={pdf}
                  pageNumber={selected.extracted.pageSource}
                  highlight={selected.extracted.description}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Brouillon suivant encore à relire, dans l'ordre du rapport. */
function nextPending(drafts: DraftReserve[], currentId: string) {
  const index = drafts.findIndex((draft) => draft.id === currentId);
  const after = [...drafts.slice(index + 1), ...drafts.slice(0, index)];
  return after.find((draft) => draft.decision === 'a_valider')?.id;
}

function DocumentDrafts({
  document,
  drafts,
  equipment,
  selectedId,
  onSelect,
}: {
  document: ReportDocument;
  drafts: DraftReserve[];
  equipment: SiteEquipment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const nameOf = (id: string | null) => equipment.find((item) => item.id === id)?.name;
  return (
    <section className="review-document">
      <h2>{DOCUMENT_TYPE_LABELS[document.type]}</h2>
      <p className="row-meta">
        {document.organisme}
        {document.dateVisite && `, visite du ${formatDate(document.dateVisite)}`}
        {document.numeroRapport && `, rapport ${document.numeroRapport}`}
      </p>
      {document.q18 && <Q18Summary q18={document.q18} />}
      {drafts.length === 0 && <p className="empty">Aucune réserve dans ce document.</p>}
      <ul className="draft-list">
        {drafts.map((draft) => {
          const low =
            draft.origin === 'constatation_q18' ||
            (draft.confiance !== null && draft.confiance < LOW_CONFIDENCE);
          return (
            <li key={draft.id}>
              <button
                type="button"
                className={draft.id === selectedId ? 'draft selected' : 'draft'}
                data-tour="draft-row"
                aria-current={draft.id === selectedId}
                onClick={() => onSelect(draft.id)}
              >
                <span className="draft-ref">{draft.extracted.reference}</span>
                <span className="draft-text">{draft.description}</span>
                <span className="draft-tags">
                  <span className={`decision decision-${draft.decision}`}>
                    {DECISION_LABELS[draft.decision]}
                  </span>
                  {low && <span className="tag tag-warning">À vérifier</span>}
                  {draft.mergeIntoId && <span className="tag">Même anomalie</span>}
                  {draft.reconduiteDeId && <span className="tag">Reconduite</span>}
                  {nameOf(draft.equipmentId) && (
                    <span className="plate plate-small">{nameOf(draft.equipmentId)}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const Q18_STATE_LABELS = {
  absence_danger: 'Absence de danger',
  danger_nouveau: 'Danger signalé pour la 1re fois',
  danger_deja_signale: 'Danger déjà signalé',
  sans_objet: 'Sans objet',
  non_verifie: 'Non vérifié',
} as const;

function Q18Summary({ q18 }: { q18: NonNullable<ReportDocument['q18']> }) {
  const dangers = q18.constatations.filter((c) => c.etat.startsWith('danger'));
  const unchecked = q18.constatations.filter((c) => c.etat === 'non_verifie');
  return (
    <div className={q18.conclusion === 'risque' ? 'q18 q18-risk' : 'q18'}>
      <p>
        {q18.conclusion === 'risque'
          ? 'Conclusion : l’installation peut entraîner des risques d’incendie ou d’explosion.'
          : q18.conclusion === 'pas_de_risque'
            ? 'Conclusion : pas de risque d’incendie ou d’explosion signalé.'
            : 'Conclusion non lisible dans le compte rendu.'}
      </p>
      {(dangers.length > 0 || unchecked.length > 0) && (
        <p className="row-meta">
          {[...dangers, ...unchecked]
            .map((c) => `Constatation ${c.numero} : ${Q18_STATE_LABELS[c.etat].toLowerCase()}`)
            .join(' ; ')}
        </p>
      )}
    </div>
  );
}

function DraftEditor({
  draft,
  detail,
  equipment,
  editable,
  onSaved,
}: {
  draft: DraftReserve;
  detail: ReportImportDetail;
  equipment: SiteEquipment[];
  editable: boolean;
  onSaved: (next: boolean) => void;
}) {
  const [fields, setFields] = useState({
    description: draft.description,
    preconisation: draft.preconisation ?? '',
    gravite: draft.gravite ?? '',
    equipmentId: draft.equipmentId ?? '',
    reconduiteDeId: draft.reconduiteDeId ?? '',
    mergeIntoId: draft.mergeIntoId ?? '',
  });
  const set = (name: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [name]: value }));

  const save = useMutation({
    mutationFn: (decision: DraftDecision) => {
      const input: DraftUpdate = {
        description: fields.description.trim(),
        preconisation: fields.preconisation.trim() || null,
        gravite: fields.gravite.trim() || null,
        equipmentId: fields.equipmentId || null,
        reconduiteDeId: fields.reconduiteDeId || null,
        mergeIntoId: fields.mergeIntoId || null,
        decision,
      };
      return api.updateDraft(draft.id, input);
    },
    onSuccess: () => onSaved(true),
  });

  // Regroupement possible avec une réserve d'un autre document qui n'est pas elle-même regroupée.
  const mergeTargets = useMemo(
    () =>
      detail.drafts.filter(
        (other) =>
          other.documentId !== draft.documentId && !other.mergeIntoId && other.id !== draft.id,
      ),
    [detail.drafts, draft],
  );
  const documentLabel = (documentId: string) => {
    const document = detail.documents.find((d) => d.id === documentId);
    return document ? DOCUMENT_TYPE_LABELS[document.type] : '';
  };
  const proposed = (id: string | null, current: string) =>
    id && id === current ? ' (proposé)' : '';
  const { extracted } = draft;

  return (
    <form
      className="draft-editor"
      data-tour="draft-editor"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate('retenue');
      }}
    >
      <div className="draft-editor-head">
        <h2>Observation {extracted.reference}</h2>
        <span className={`decision decision-${draft.decision}`}>
          {DECISION_LABELS[draft.decision]}
        </span>
      </div>
      {draft.origin === 'constatation_q18' && (
        <p className="review-note">
          Constatation standard du Q18 cochée en danger sans point détaillé : proposée par
          l’application, à retenir seulement si elle correspond à une anomalie à lever.
        </p>
      )}
      <dl className="details">
        {extracted.localisationTexte && (
          <>
            <dt>Localisation</dt>
            <dd>{extracted.localisationTexte}</dd>
          </>
        )}
        {extracted.articleReglementaire && (
          <>
            <dt>Article</dt>
            <dd>{extracted.articleReglementaire}</dd>
          </>
        )}
        {extracted.nouvelleOuReconduite && (
          <>
            <dt>Dans le rapport</dt>
            <dd>
              {extracted.nouvelleOuReconduite === 'reconduite' ? 'Déjà signalée' : 'Nouvelle'}
            </dd>
          </>
        )}
        {extracted.thermique && (
          <>
            <dt>Relevé</dt>
            <dd>
              {extracted.thermique.temperatureDefaut ?? '?'} °C contre{' '}
              {extracted.thermique.temperatureReference ?? '?'} °C
              {extracted.thermique.ecart !== null && `, écart ${extracted.thermique.ecart} °C`}
            </dd>
          </>
        )}
        {draft.confiance !== null && (
          <>
            <dt>Confiance</dt>
            <dd>{Math.round(draft.confiance * 100)} %</dd>
          </>
        )}
      </dl>

      <fieldset disabled={!editable} className="draft-fields">
        <label>
          Constat
          <textarea
            rows={4}
            required
            value={fields.description}
            onChange={(event) => set('description')(event.target.value)}
          />
        </label>
        <label>
          Préconisation
          <textarea
            rows={2}
            value={fields.preconisation}
            onChange={(event) => set('preconisation')(event.target.value)}
          />
        </label>
        <label>
          Gravité
          <input value={fields.gravite} onChange={(event) => set('gravite')(event.target.value)} />
        </label>
        <label>
          Équipement
          <select
            value={fields.equipmentId}
            onChange={(event) => set('equipmentId')(event.target.value)}
          >
            <option value="">Aucun (à rattacher plus tard)</option>
            {equipment.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}, {item.buildingName} {item.floorName}
                {proposed(draft.proposedEquipmentId, item.id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reconduite d’une réserve en cours
          <select
            value={fields.reconduiteDeId}
            onChange={(event) => set('reconduiteDeId')(event.target.value)}
          >
            <option value="">Non, nouvelle réserve</option>
            {detail.openReserves.map((reserve) => (
              <option key={reserve.id} value={reserve.id}>
                {reserve.reference ? `Obs. ${reserve.reference} : ` : ''}
                {reserve.description.slice(0, 90)}
                {proposed(draft.proposedReconduiteDeId, reserve.id)}
              </option>
            ))}
          </select>
        </label>
        {mergeTargets.length > 0 && (
          <label>
            Même anomalie qu’une réserve d’un autre document
            <select
              value={fields.mergeIntoId}
              onChange={(event) => set('mergeIntoId')(event.target.value)}
            >
              <option value="">Non, réserve distincte</option>
              {mergeTargets.map((other) => (
                <option key={other.id} value={other.id}>
                  {documentLabel(other.documentId)}, obs. {other.extracted.reference} :{' '}
                  {other.description.slice(0, 70)}
                  {proposed(draft.proposedMergeIntoId, other.id)}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      {editable && (
        <div className="panel-actions">
          <button type="submit" disabled={save.isPending}>
            Retenir
          </button>
          <button
            type="button"
            className="secondary"
            disabled={save.isPending}
            onClick={() => save.mutate('ecartee')}
          >
            Écarter
          </button>
        </div>
      )}
      <MutationError error={save.error} />
    </form>
  );
}
