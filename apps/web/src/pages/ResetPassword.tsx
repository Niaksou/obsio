import { Link, useNavigate, useSearchParams } from 'react-router';
import { authClient } from '../auth-client.js';
import { field, Field, Form } from '../components/Form.js';
import { useSubmit } from '../components/useSubmit.js';

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { pending, error, run } = useSubmit();

  if (!token || params.get('error')) {
    return (
      <div className="card">
        <h1>Lien invalide</h1>
        <p>Ce lien de réinitialisation est invalide ou a expiré.</p>
        <Link to="/mot-de-passe-oublie">Demander un nouveau lien</Link>
      </div>
    );
  }

  async function submit(data: FormData) {
    const ok = await run(() =>
      authClient.resetPassword({ newPassword: field(data, 'password'), token: token! }),
    );
    if (ok) navigate('/connexion', { replace: true });
  }

  return (
    <Form
      title="Nouveau mot de passe"
      submitLabel="Enregistrer"
      pending={pending}
      error={error}
      onSubmit={submit}
    >
      <Field
        label="Nouveau mot de passe (12 caractères minimum)"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={12}
      />
    </Form>
  );
}
