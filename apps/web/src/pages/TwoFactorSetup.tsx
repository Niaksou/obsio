import { useState } from 'react';
import { authClient } from '../auth-client.js';
import { field, Field, Form } from '../components/Form.js';
import { QrCode } from '../components/QrCode.js';
import { useSubmit } from '../components/useSubmit.js';

interface Enrolment {
  totpURI: string;
  backupCodes: string[];
}

/**
 * Activation de la double authentification, obligatoire avant d'accéder à l'application :
 * mot de passe, puis QR code à scanner, codes de secours à conserver et premier code.
 */
export function TwoFactorSetup() {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const { pending, error, run } = useSubmit();

  async function start(data: FormData) {
    await run(async () => {
      const result = await authClient.twoFactor.enable({ password: field(data, 'password') });
      if (result.data && 'totpURI' in result.data && result.data.totpURI) {
        setEnrolment({ totpURI: result.data.totpURI, backupCodes: result.data.backupCodes ?? [] });
      }
      return result;
    });
  }

  async function confirm(data: FormData) {
    // Une fois le code accepté, la session est renouvelée et l'application s'affiche.
    await run(() => authClient.twoFactor.verifyTotp({ code: field(data, 'code') }));
  }

  if (!enrolment) {
    return (
      <Form
        title="Double authentification"
        submitLabel="Continuer"
        pending={pending}
        error={error}
        onSubmit={start}
      >
        <p>
          Pour protéger les données de votre organisation, chaque connexion demande, en plus du mot
          de passe, un code à 6 chiffres donné par une application d'authentification sur votre
          téléphone (Google Authenticator, Microsoft Authenticator, Authy…).
        </p>
        <p className="hint">Confirmez d'abord votre mot de passe.</p>
        <Field
          label="Mot de passe"
          name="password"
          type="password"
          autoComplete="current-password"
        />
      </Form>
    );
  }

  const secret = new URL(enrolment.totpURI).searchParams.get('secret') ?? '';
  return (
    <Form
      title="Double authentification"
      submitLabel="Activer"
      pending={pending}
      error={error}
      onSubmit={confirm}
    >
      <p>1. Scannez ce QR code avec votre application d'authentification.</p>
      <QrCode value={enrolment.totpURI} label="QR code à scanner avec l'application" />
      <p className="hint">
        Sans appareil photo, saisissez cette clé dans l'application :{' '}
        <code className="secret-key">{secret.match(/.{1,4}/g)?.join(' ')}</code>
      </p>
      <p>
        2. Conservez ces codes de secours en lieu sûr (gestionnaire de mots de passe, papier).
        Chacun remplace une fois le code de l'application si vous perdez votre téléphone.
      </p>
      <ul className="backup-codes">
        {enrolment.backupCodes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <p>3. Saisissez le code à 6 chiffres affiché par l'application.</p>
      <CodeField />
    </Form>
  );
}

/** Champ de code à 6 chiffres, rempli automatiquement par le téléphone quand il le peut. */
export function CodeField({ label = 'Code à 6 chiffres' }: { label?: string }) {
  return (
    <label>
      {label}
      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
      />
    </label>
  );
}
