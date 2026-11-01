import { IMPORT_STATUS_LABELS, REPORT_MAX_BYTES, type ReportImport } from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, uploadToStorage } from '../api.js';
import { MutationError } from '../components/MutationError.js';
import { keys } from '../queries.js';

const MAX_MB = Math.round(REPORT_MAX_BYTES / 1024 / 1024);
const ANALYSIS_POLL_MS = 3000;

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function importSummary(item: ReportImport) {
  if (item.status === 'en_analyse') return 'Analyse en cours';
  if (item.status === 'erreur') return item.error ?? 'Analyse en échec';
  const n = item.reserveCount;
  if (item.status === 'valide') return `${n} réserve${n > 1 ? 's' : ''} activée${n > 1 ? 's' : ''}`;
  return `${n} réserve${n > 1 ? 's' : ''} à relire`;
}

/** Rapports de vérification d'un site : dépôt (admin) et suivi de l'analyse. */
export function ImportsSection({ siteId, isAdmin }: { siteId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const imports = useQuery({
    queryKey: keys.imports(siteId),
    queryFn: () => api.imports(siteId),
    // Tant qu'un rapport est en analyse, la liste se met à jour toute seule.
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === 'en_analyse') ? ANALYSIS_POLL_MS : false,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.type !== 'application/pdf') throw new Error('Déposez le rapport au format PDF.');
      if (file.size > REPORT_MAX_BYTES) throw new Error(`Ce fichier dépasse ${MAX_MB} Mo.`);
      const post = await api.reportUpload(siteId, { fileName: file.name, size: file.size });
      await uploadToStorage(post, file);
      return api.createImport(siteId, { key: post.key, fileName: file.name });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.imports(siteId) }),
  });

  return (
    <section className="reports">
      <div className="title-row section-title">
        <h2>Rapports de vérification</h2>
      </div>
      {imports.data?.length === 0 && (
        <p className="empty">
          {isAdmin
            ? 'Déposez le rapport PDF de l’organisme de contrôle : les réserves sont extraites, puis vous les relisez avant de les activer.'
            : 'Aucun rapport importé pour l’instant.'}
        </p>
      )}
      {imports.data && imports.data.length > 0 && (
        <ul className="rows">
          {imports.data.map((item) => (
            <li key={item.id}>
              <Link to={`/imports/${item.id}`} className="row-link">
                <span className="row-title">{item.fileName}</span>
                <span className="row-meta">déposé le {formatDate(item.createdAt)}</span>
                <span className={`status status-${item.status}`}>
                  {IMPORT_STATUS_LABELS[item.status]} : {importSummary(item)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {isAdmin && (
        <div className="inline-form compact">
          <label className="file-drop file-drop-inline">
            <span>{upload.isPending ? 'Envoi du rapport…' : 'Importer un rapport PDF'}</span>
            <input
              type="file"
              accept="application/pdf"
              disabled={upload.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) upload.mutate(file);
              }}
            />
          </label>
          <MutationError error={upload.error} />
        </div>
      )}
    </section>
  );
}
