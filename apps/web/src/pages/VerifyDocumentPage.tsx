import type { DocumentVerification } from '@obsio/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileCheck, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, ApiError } from '../api.js';
import { Loading } from '../components/Loading.js';
import { Logo } from '../components/Logo.js';
import { plural } from '../reserves/status.js';

// Page publique « Vérifier un document », deux accès :
//   - par le QR code du dossier (souvent un téléphone, sans le fichier) : la fiche du document
//     tel qu'il a été émis, à comparer avec celui qu'on a sous les yeux, imprimé ou à l'écran ;
//   - par le fichier : l'empreinte SHA-256 du PDF est calculée dans le navigateur, seule elle
//     part vers l'API, qui dit si elle figure au registre des documents émis.
// Dans les deux cas, l'API ne renvoie que le strict minimum.

async function fingerprint(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Outcome = { file: string } & (
  { kind: 'valid'; document: DocumentVerification } | { kind: 'unknown' }
);

const isMissing = (error: unknown) => error instanceof ApiError && error.status === 404;

function Facts({ document }: { document: DocumentVerification }) {
  return (
    <dl className="verify-facts">
      <div>
        <dt>Document</dt>
        <dd>
          <span className="plate">n° {document.number}</span>
        </dd>
      </div>
      <div>
        <dt>Émis le</dt>
        <dd>
          {new Date(document.issuedAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </dd>
      </div>
      <div>
        <dt>Organisation</dt>
        <dd>{document.organisationName}</dd>
      </div>
      <div>
        <dt>Réserves</dt>
        <dd>
          {plural(document.liftedCount, 'levée')} sur {document.reserveCount}
        </dd>
      </div>
    </dl>
  );
}

function Result({
  tone,
  title,
  children,
}: {
  tone: 'valid' | 'unknown';
  title: string;
  children: React.ReactNode;
}) {
  const Icon = tone === 'valid' ? ShieldCheck : ShieldAlert;
  return (
    <section className={`verify-result ${tone}`} aria-live="polite">
      <h2>
        <Icon size={18} strokeWidth={1.5} aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

export function VerifyDocumentPage() {
  const [params] = useSearchParams();
  const raw = params.get('document');
  const documentId = raw && UUID.test(raw) ? raw : null;
  const [dragging, setDragging] = useState(false);
  const secure = typeof crypto !== 'undefined' && 'subtle' in crypto;

  // Fiche du document du QR code.
  const sheet = useQuery({
    queryKey: ['document-sheet', documentId],
    queryFn: () => api.documentSheet(documentId!),
    enabled: documentId !== null,
    retry: (count, error) => !isMissing(error) && count < 2,
  });

  const verify = useMutation({
    mutationFn: async (file: File): Promise<Outcome> => {
      if (file.type && file.type !== 'application/pdf') {
        throw new Error('Choisissez le fichier PDF du dossier.');
      }
      try {
        const document = await api.verifyDocument(await fingerprint(file));
        return { file: file.name, kind: 'valid', document };
      } catch (error) {
        if (isMissing(error)) return { file: file.name, kind: 'unknown' };
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

  const expected = sheet.data ?? null;
  const result = verify.data;

  const dropZone = secure ? (
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
    <p className="error">La vérification du fichier demande une connexion sécurisée (https).</p>
  );

  return (
    <div className="public verify">
      <header className="public-head">
        <Link to="/" className="brand" aria-label="Obsio">
          <Logo />
        </Link>
      </header>
      <main className="verify-body">
        <h1>Vérifier un dossier de preuves</h1>

        {documentId ? (
          <>
            {!sheet.error && (
              <p className="verify-lead">
                Le dossier du QR code, tel qu’il a été émis. Comparez ces informations avec celles
                du document que vous avez sous les yeux, imprimé ou à l’écran : elles doivent être
                identiques.
              </p>
            )}
            {sheet.isPending && <Loading shape="detail" inline />}
            {sheet.error &&
              (isMissing(sheet.error) ? (
                <Result tone="unknown" title="QR code inconnu">
                  <p>
                    Aucun dossier ne correspond à ce QR code : le document n’a pas été émis avec
                    Obsio, ou son QR code a été modifié.
                  </p>
                </Result>
              ) : (
                <p className="error">{sheet.error.message}</p>
              ))}
            {expected && (
              <Result tone="valid" title="Dossier enregistré par Obsio">
                <Facts document={expected} />
              </Result>
            )}

            {expected && (
              <section className="verify-file" aria-labelledby="verify-file-title">
                <h2 id="verify-file-title">Contrôler le fichier PDF</h2>
                <p className="hint">
                  Depuis l’ordinateur où se trouve le fichier reçu : son empreinte est calculée sur
                  l’appareil, le fichier lui-même n’est pas envoyé.
                </p>
                {dropZone}
              </section>
            )}
          </>
        ) : (
          <>
            <p className="verify-lead">
              Déposez le dossier de preuves reçu en PDF. Son empreinte est calculée sur votre
              appareil, le fichier lui-même n’est pas envoyé.
            </p>
            {dropZone}
          </>
        )}

        {verify.error && <p className="error">{verify.error.message}</p>}

        {result?.kind === 'valid' &&
          (expected && expected.number === result.document.number ? (
            <Result tone="valid" title="Fichier authentique">
              <p>
                {result.file} est identique, octet pour octet, au dossier{' '}
                <span className="plate">n° {expected.number}</span> émis avec Obsio.
              </p>
            </Result>
          ) : (
            <Result tone="valid" title="Fichier authentique">
              <p>
                {result.file} est identique, octet pour octet, à un document émis avec Obsio.
                {expected && <> Ce n’est pas le dossier du QR code, mais un autre :</>}
              </p>
              <Facts document={result.document} />
            </Result>
          ))}

        {result?.kind === 'unknown' && (
          <Result tone="unknown" title="Fichier non reconnu">
            <p>
              {result.file} ne figure pas au registre : il a été modifié ou réenregistré après son
              émission, ou il n’a pas été émis avec Obsio. Demandez le fichier d’origine à
              l’organisation qui vous l’a transmis.
            </p>
          </Result>
        )}

        <p className="verify-note hint">
          Chaque dossier est aussi signé électroniquement : votre lecteur PDF affiche la signature
          d’Obsio.
        </p>
      </main>
    </div>
  );
}
