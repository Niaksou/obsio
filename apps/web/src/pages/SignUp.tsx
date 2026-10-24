import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { authClient } from '../auth-client.js';
import { field, Field, Form } from '../components/Form.js';
import { safeRedirect } from '../components/RequireSession.js';
import { useSubmit } from '../components/useSubmit.js';

export function SignUp() {
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const { pending, error, run } = useSubmit();
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(data: FormData) {
    const email = field(data, 'email');
    const ok = await run(() =>
      authClient.signUp.email({
        name: field(data, 'name'),
        email,
        password: field(data, 'password'),
        // Le lien de vérification connecte l'utilisateur puis le ramène ici.
        callbackURL: window.location.origin + redirect,
      }),
    );
    if (ok) setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="card">
        <h1>Vérifiez votre boîte mail</h1>
        <p>
          Un lien de confirmation a été envoyé à <strong>{sentTo}</strong>. Cliquez dessus pour
          activer votre compte.
        </p>
      </div>
    );
  }

  return (
    <Form
      title="Créer un compte"
      submitLabel="Créer mon compte"
      pending={pending}
      error={error}
      onSubmit={submit}
      footer={<Link to={`/connexion${params.size ? `?${params}` : ''}`}>J'ai déjà un compte</Link>}
    >
      <Field label="Nom" name="name" autoComplete="name" />
      <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" />
      <Field
        label="Mot de passe (12 caractères minimum)"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
      />
    </Form>
  );
}
