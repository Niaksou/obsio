import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { authClient } from '../auth-client.js';
import { field, Field, Form } from '../components/Form.js';
import { isInvitationPath, safeRedirect } from '../components/RequireSession.js';
import { useSubmit } from '../components/useSubmit.js';

export function SignUp() {
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const { pending, error, run } = useSubmit();
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Le lien de vérification connecte l'utilisateur puis le ramène sur l'invitation.
  const callbackURL = window.location.origin + redirect;

  async function submit(data: FormData) {
    const email = field(data, 'email');
    const password = String(data.get('password') ?? '');
    if (password !== String(data.get('passwordConfirm') ?? '')) {
      await run(async () => ({ error: { code: 'PASSWORD_MISMATCH' } }));
      return;
    }
    const firstName = field(data, 'firstName');
    const lastName = field(data, 'lastName');
    const ok = await run(() =>
      authClient.signUp.email({
        name: `${firstName} ${lastName}`,
        firstName,
        lastName,
        email,
        password,
        callbackURL,
      }),
    );
    if (ok) setSentTo(email);
  }

  if (!isInvitationPath(redirect)) {
    return (
      <div className="card">
        <h1>Inscription sur invitation</h1>
        <p>
          Les comptes sont créés à partir d'une invitation reçue par e-mail. Si votre entreprise
          utilise déjà le service, demandez une invitation à son administrateur.
        </p>
        <Link to="/connexion">J'ai déjà un compte</Link>
      </div>
    );
  }

  if (sentTo) return <CheckInbox email={sentTo} callbackURL={callbackURL} />;

  return (
    <Form
      title="Créer un compte"
      submitLabel="Créer mon compte"
      pending={pending}
      error={error}
      onSubmit={submit}
      footer={<Link to={`/connexion${params.size ? `?${params}` : ''}`}>J'ai déjà un compte</Link>}
    >
      <div className="field-row">
        <Field label="Prénom" name="firstName" autoComplete="given-name" />
        <Field label="Nom" name="lastName" autoComplete="family-name" />
      </div>
      <Field label="E-mail" name="email" type="email" autoComplete="email" />
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        hint="12 caractères minimum"
      />
      <Field
        label="Confirmer le mot de passe"
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        minLength={12}
      />
    </Form>
  );
}

/** Après l'inscription : rappel de l'adresse, et nouvel envoi du lien s'il n'est pas arrivé. */
function CheckInbox({ email, callbackURL }: { email: string; callbackURL: string }) {
  const { pending, error, run } = useSubmit();
  const [resent, setResent] = useState(false);

  async function resend() {
    setResent(false);
    const ok = await run(() => authClient.sendVerificationEmail({ email, callbackURL }));
    setResent(ok);
  }

  return (
    <div className="card">
      <h1>Vérifiez votre boîte mail</h1>
      <p>
        Un lien de confirmation a été envoyé à <strong>{email}</strong>. Cliquez dessus pour activer
        votre compte.
      </p>
      <p className="hint">
        Rien reçu après quelques minutes ? Regardez dans les courriers indésirables, puis demandez
        un nouveau lien.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {resent && <p role="status">Nouveau lien envoyé.</p>}
      <button type="button" className="secondary" disabled={pending} onClick={() => void resend()}>
        {pending ? 'Envoi…' : 'Renvoyer le lien'}
      </button>
    </div>
  );
}
