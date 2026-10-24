import { useState } from 'react';
import { Link } from 'react-router';
import { authClient } from '../auth-client.js';
import { field, Field, Form } from '../components/Form.js';
import { useSubmit } from '../components/useSubmit.js';

export function ForgotPassword() {
  const { pending, error, run } = useSubmit();
  const [sent, setSent] = useState(false);

  async function submit(data: FormData) {
    const ok = await run(() =>
      authClient.requestPasswordReset({
        email: field(data, 'email'),
        redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
      }),
    );
    if (ok) setSent(true);
  }

  if (sent) {
    return (
      <div className="card">
        <h1>Demande envoyée</h1>
        <p>Si un compte existe avec cette adresse, vous allez recevoir un lien par e-mail.</p>
        <Link to="/connexion">Retour à la connexion</Link>
      </div>
    );
  }

  return (
    <Form
      title="Mot de passe oublié"
      submitLabel="Recevoir un lien"
      pending={pending}
      error={error}
      onSubmit={submit}
      footer={<Link to="/connexion">Retour à la connexion</Link>}
    >
      <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" />
    </Form>
  );
}
