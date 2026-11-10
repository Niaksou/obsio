import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@obsio/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { downloadProofDossier } from '../api.js';
import { MutationError } from '../components/MutationError.js';

/** Export du dossier de preuves en PDF, pour l'assureur (Q18, Q19) ou le dossier réglementaire. */
export function DossierExport({ siteId }: { siteId: string }) {
  const [documentType, setDocumentType] = useState<DocumentType | ''>('');
  const [scope, setScope] = useState<'toutes' | 'levees'>('toutes');
  const download = useMutation({
    mutationFn: () =>
      downloadProofDossier(siteId, {
        ...(documentType ? { documentType } : {}),
        scope,
      }),
  });

  return (
    <section className="inline-form dossier-export" data-tour="dossier-export">
      <h2>Dossier de preuves</h2>
      <p className="hint">
        Un PDF avec, pour chaque réserve, le rapport d’origine, son état et les photos de la
        correction.
      </p>
      <div className="fields">
        <label>
          Origine
          <select
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value as DocumentType | '')}
          >
            <option value="">Tous les rapports</option>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Réserves
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as 'toutes' | 'levees')}
          >
            <option value="toutes">Toutes, avec leur état</option>
            <option value="levees">Levées seulement</option>
          </select>
        </label>
        <button type="button" disabled={download.isPending} onClick={() => download.mutate()}>
          {download.isPending ? 'Préparation du PDF…' : 'Télécharger le PDF'}
        </button>
      </div>
      <MutationError error={download.error} />
    </section>
  );
}
