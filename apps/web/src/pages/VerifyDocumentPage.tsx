import type { DocumentVerification } from '@obsio/shared';
import { useMutation } from '@tanstack/react-query';
import { FileCheck, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, ApiError } from '../api.js';
import { Logo } from '../components/Logo.js';
import { plural } from '../reserves/status.js';

// Page publique « Vérifier un document » : on y dépose un dossier de preuves reçu en PDF.
// L'empreinte SHA-256 est calculée dans le navigateur, seule elle part vers l'API, qui dit si
// elle figure au registre des documents émis (et rien d'autre que le strict minimum).

async function fingerprint(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const numberFromId = (id: string | null) =>
  id && /^[0-9a-f-]{36}$/i.test(id) ? `${id.slice(0, 4)}-${id.slice(4, 8)}`.toUpperCase() : null;

type Outcome = { file: string } & (
  { kind: 'valid'; document: DocumentVerification } | { kind: 'unknown' }
);

export function VerifyDocumentPage() {
  const [params] = useSearchParams();
  const expected = numberFromId(params.get('document'));
  const [dragging, setDragging] = useState(false);
  const secure = typeof crypto !== 'undefined' && 'subtle' in crypto;

  const verify = useMutation({
    mutationFn: async (file: File): Promise<Outcome> => {
      if (file.type && file.type !== 'application/pdf') {
        throw new Error('Choisissez le fichier PDF du dossier.');
      }
      try {
        return {
          file: file.name,
          kind: 'valid',
          document: await api.verifyDocument(await fingerprint(file)),
        };
      } catch (error) {
        if (error instanceof ApiError && error.status === 404)
          return { file: file.name, kind: 'unknown' };
        throw error;
      }
    },
  });

  const pick = (file: File | undefined) => {
    if (file) verify.mutate(file);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  };

  const result = verify.data;
  return (
    <div className="public verify">
      <header className="public-head">
        <Link to="/" className="brand" aria-label="Obsio">
          <Logo />
        </Link>
      </header>
      <main className="verify-body">
        <h1>Vérifier un document</h1>
        <p className="verify-lead">
          Déposez le dossier de preuves reçu en PDF. Son empreinte est calculée sur votre appareil,
          le fichier lui-même n’est pas envoyé.
        </p>
        {expected && (
          <p className="hint">
            Vous venez du QR code du document <span className="plate">n° {expected}</span>.
          </p>
        )}

        {secure ? (
          <label
            className={`verify-drop${dragging ? ' dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
          >
            <FileCheck size={18} strokeWidth={1.5} aria-hidden />
            <span className="verify-drop-title">
              {verify.isPending ? 'Vérification…' : 'Choisir le fichier PDF'}
            </span>
            <span className="hint">ou le déposer ici</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={verify.isPending}
              onChange={(event) => {
                pick(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
        ) : (
          <p className="error">
            La vérification demande une connexion sécurisée (adresse en https).
          </p>
        )}

        {verify.error && <p className="error">{verify.error.message}</p>}

        {result?.kind === 'valid' && (
          <section className="verify-result valid" aria-live="polite">
            <h2>
              <ShieldCheck size={18} strokeWidth={1.5} aria-hidden />
              Document authentique
            </h2>
            <p>
              {result.file} est identique, octet pour octet, au document émis avec Obsio.
              {expected && expected !== result.document.number && (
                <> Ce n’est pas le document du QR code scanné, mais un autre dossier enregistré.</>
              )}
            </p>
            <dl className="verify-facts">
              <div>
                <dt>Document</dt>
                <dd>
                  <span className="plate">n° {result.document.number}</span>
                </dd>
              </div>
              <div>
                <dt>Émis le</dt>
                <dd>
                  {new Date(result.document.issuedAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt>Organisation</dt>
                <dd>{result.document.organisationName}</dd>
              </div>
              <div>
                <dt>Réserves</dt>
                <dd>
                  {plural(result.document.liftedCount, 'levée')} sur {result.document.reserveCount}
                </dd>
              </div>
            </dl>
          </section>
        )}

        {result?.kind === 'unknown' && (
          <section className="verify-result unknown" aria-live="polite">
            <h2>
              <ShieldAlert size={18} strokeWidth={1.5} aria-hidden />
              Document non reconnu
            </h2>
            <p>
              {result.file} ne figure pas au registre : il a été modifié après son émission, ou il
              n’a pas été émis avec Obsio. Demandez le fichier d’origine à l’organisation qui vous
              l’a transmis.
            </p>
          </section>
        )}

        <p className="verify-note hint">
          Chaque dossier est aussi signé électroniquement : votre lecteur PDF affiche la signature
          d’Obsio. Une copie imprimée ou réenregistrée ne peut pas être vérifiée ici.
        </p>
      </main>
    </div>
  );
}
