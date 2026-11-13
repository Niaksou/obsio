import { IMPORT_STATUS_LABELS, REPORT_MAX_BYTES, type ReportImport } from '@obsio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
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

/** Dépôt d'un rapport PDF : envoi au stockage, puis création de l'import (analyse). */
export function useReportUpload(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['report-upload', siteId],
    mutationFn: async (file: File) => {
      if (file.type !== 'application/pdf') throw new Error('Déposez le rapport au format PDF.');
      if (file.size > REPORT_MAX_BYTES) throw new Error(`Ce fichier dépasse ${MAX_MB} Mo.`);
      const post = await api.reportUpload(siteId, { fileName: file.name, size: file.size });
      await uploadToStorage(post, file);
      return api.createImport(siteId, { key: post.key, fileName: file.name });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.imports(siteId) }),
  });
}

/** Bouton « Importer un rapport » : un champ fichier habillé en bouton principal. */
export function ReportUploadButton({ siteId }: { siteId: string }) {
  const upload = useReportUpload(siteId);
  return (
    <div className="upload-button" data-tour="site-upload">
      <label className={upload.isPending ? 'button-file pending' : 'button-file'}>
        <FileUp size={18} strokeWidth={1.5} aria-hidden />
        <span>{upload.isPending ? 'Envoi du rapport…' : 'Importer un rapport'}</span>
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
  );
}

/** Rapports de vérification d'un site et suivi de leur analyse ; le dépôt est dans l'en-tête. */
export function ImportsSection({ siteId, isManager }: { siteId: string; isManager: boolean }) {
  const imports = useQuery({
    queryKey: keys.imports(siteId),
    queryFn: () => api.imports(siteId),
    // Tant qu'un rapport est en analyse, la liste se met à jour toute seule.
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === 'en_analyse') ? ANALYSIS_POLL_MS : false,
  });

  return (
    <section className="site-section" data-tour="site-reports" aria-labelledby="reports-title">
      <h2 id="reports-title">Rapports de vérification</h2>
      {imports.data?.length === 0 && (
        <p className="empty">
          {isManager
            ? 'Importez le rapport PDF de l’organisme de contrôle : les réserves sont extraites, puis vous les relisez avant de les activer.'
            : 'Aucun rapport importé pour l’instant.'}
        </p>
      )}
      {imports.data && imports.data.length > 0 && (
        <ul className="rows report-rows">
          {imports.data.map((item) => (
            <li key={item.id}>
              <Link to={`/imports/${item.id}`} className="report-row">
                <span className="row-title">{item.fileName}</span>
                <span className={`report-status status-${item.status}`}>
                  {IMPORT_STATUS_LABELS[item.status]} · {importSummary(item)}
                </span>
                <small>Déposé le {formatDate(item.createdAt)}</small>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
