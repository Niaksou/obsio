import { Link, useNavigate, useSearchParams } from 'react-router';
import { authClient } from '../auth-client.js';
import { field, Field, Form } from '../components/Form.js';
import { safeRedirect } from '../components/RequireSession.js';
import { useSubmit } from '../components/useSubmit.js';

export function SignIn() {
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const navigate = useNavigate();
  const { pending, error, run } = useSubmit();

  async function submit(data: FormData) {
    const ok = await run(() =>
      authClient.signIn.email({ email: field(data, 'email'), password: field(data, 'password') }),
    );
    if (ok) navigate(redirect, { replace: true });
  }

  const query = params.get('redirect') ? `?redirect=${encodeURIComponent(redirect)}` : '';
  return (
    <Form
      title="Connexion"
      submitLabel="Se connecter"
      pending={pending}
      error={error}
      onSubmit={submit}
      footer={
        <>
          <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
          <Link to={`/inscription${query}`}>Créer un compte</Link>
        </>
      }
    >
      <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" />
      <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" />
    </Form>
  );
}
