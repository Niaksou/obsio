import { useState } from 'react';
import { authClient } from '../auth-client.js';
import { BackupCodes } from '../components/BackupCodes.js';
import { field, Field, Form } from '../components/Form.js';
import { QrCode } from '../components/QrCode.js';
import { useSubmit } from '../components/useSubmit.js';

interface Enrolment {
  totpURI: string;
  backupCodes: string[];
}

type Step = 'scan' | 'backup' | 'verify';

const STEPS: Record<Step, { number: number; title: string }> = {
  scan: { number: 1, title: 'Scannez le QR code' },
  backup: { number: 2, title: 'Gardez vos codes de secours' },
  verify: { number: 3, title: 'Saisissez le code' },
};

/**
 * Activation de la double authentification, obligatoire avant d'accéder à l'application :
 * mot de passe, puis trois étapes courtes. Les codes de secours passent avant le code de
 * confirmation : une fois le code accepté, la session est renouvelée et l'application s'affiche.
 */
export function TwoFactorSetup() {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [step, setStep] = useState<Step>('scan');
  const [saved, setSaved] = useState(false);
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
    await run(() => authClient.twoFactor.verifyTotp({ code: field(data, 'code') }));
  }

  if (!enrolment) {
    return (
      <Form
        title="Sécurisez votre compte"
        submitLabel="Continuer"
        pending={pending}
        error={error}
        onSubmit={start}
      >
        <p>
          À chaque connexion, un code à 6 chiffres vous sera demandé en plus du mot de passe. Il
          vous faut une application d'authentification (Google Authenticator, Microsoft
          Authenticator…).
        </p>
        <Field
          label="Votre mot de passe"
          name="password"
          type="password"
          autoComplete="current-password"
        />
      </Form>
    );
  }

  const { number, title } = STEPS[step];
  const heading = (
    <p className="step-label">
      Étape {number} sur 3 · <strong>{title}</strong>
    </p>
  );

  if (step === 'scan') {
    const secret = new URL(enrolment.totpURI).searchParams.get('secret') ?? '';
    return (
      <Form
        title="Double authentification"
        submitLabel="Suivant"
        pending={false}
        error={null}
        onSubmit={() => setStep('backup')}
      >
        {heading}
        <p>Ouvrez votre application d'authentification et scannez ce code.</p>
        <QrCode value={enrolment.totpURI} label="QR code à scanner avec l'application" />
        <details className="hint">
          <summary>Pas d'appareil photo ?</summary>
          Saisissez cette clé dans l'application :{' '}
          <code className="secret-key">{secret.match(/.{1,4}/g)?.join(' ')}</code>
        </details>
      </Form>
    );
  }

  if (step === 'backup') {
    return (
      <Form
        title="Double authentification"
        submitLabel="Suivant"
        pending={false}
        error={null}
        onSubmit={() => setStep('verify')}
        footer={
          <button type="button" className="link" onClick={() => setStep('scan')}>
            Retour
          </button>
        }
      >
        {heading}
        <p>Si vous perdez votre téléphone, chacun de ces codes vous connecte une fois.</p>
        <BackupCodes codes={enrolment.backupCodes} />
        <label className="check">
          <input
            type="checkbox"
            checked={saved}
            onChange={(event) => setSaved(event.target.checked)}
            required
          />
          Je les ai conservés en lieu sûr
        </label>
      </Form>
    );
  }

  return (
    <Form
      title="Double authentification"
      submitLabel="Activer"
      pending={pending}
      error={error}
      onSubmit={confirm}
      footer={
        <button type="button" className="link" onClick={() => setStep('backup')}>
          Retour
        </button>
      }
    >
      {heading}
      <p>Saisissez le code affiché par l'application.</p>
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
        autoFocus
      />
    </label>
  );
}
