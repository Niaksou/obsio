import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { authClient, errorMessage, passkeyCancelled, passkeysSupported } from '../auth-client.js';
import { field, Field, Form } from '../components/Form.js';
import { isInvitationPath, safeRedirect } from '../components/RequireSession.js';
import { useSubmit } from '../components/useSubmit.js';
import { CodeField } from './TwoFactorSetup.js';

export function SignIn() {
  const [params] = useSearchParams();
  const redirect = safeRedirect(params.get('redirect'));
  const navigate = useNavigate();
  const { pending, error, run } = useSubmit();
  // Après le mot de passe : code de l'application, ou code de secours.
  const [step, setStep] = useState<'password' | 'code' | 'backup'>('password');

  // Session ouverte (mot de passe, puis code s'il est demandé) : on attend qu'elle soit relue
  // avant de quitter la page, sinon la page demandée renverrait ici.
  const { data: session } = authClient.useSession();
  useEffect(() => {
    if (session) navigate(redirect, { replace: true });
  }, [session, navigate, redirect]);

  // Suggestion de la passkey dans le champ e-mail (« autofill »), sur les navigateurs qui la
  // proposent ; sans effet ailleurs. Un abandon n'est pas une erreur.
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  useEffect(() => {
    if (step !== 'password' || !passkeysSupported()) return;
    let active = true;
    void (async () => {
      if (!(await PublicKeyCredential.isConditionalMediationAvailable?.())) return;
      const result = await authClient.signIn.passkey({ autoFill: true });
      if (active && result.error && !passkeyCancelled(result.error)) {
        setPasskeyError(errorMessage(result.error));
      }
    })();
    return () => {
      active = false;
    };
  }, [step]);

  async function signInWithPasskey() {
    setPasskeyError(null);
    const result = await authClient.signIn.passkey();
    if (result.error && !passkeyCancelled(result.error))
      setPasskeyError(errorMessage(result.error));
  }

  async function submit(data: FormData) {
    let needsCode = false;
    const ok = await run(async () => {
      const result = await authClient.signIn.email({
        email: field(data, 'email'),
        password: field(data, 'password'),
      });
      needsCode = !!result.data && 'twoFactorRedirect' in result.data;
      return result;
    });
    if (ok && needsCode) setStep('code');
  }

  async function submitCode(data: FormData) {
    const code = field(data, 'code');
    await run(() =>
      step === 'backup'
        ? authClient.twoFactor.verifyBackupCode({ code })
        : authClient.twoFactor.verifyTotp({ code }),
    );
  }

  if (step !== 'password') {
    return (
      <Form
        title="Code de vérification"
        submitLabel="Valider"
        pending={pending}
        error={error}
        onSubmit={submitCode}
        footer={
          <button
            type="button"
            className="link"
            onClick={() => setStep(step === 'code' ? 'backup' : 'code')}
          >
            {step === 'code' ? 'Utiliser un code de secours' : "Utiliser l'application"}
          </button>
        }
      >
        {step === 'code' ? (
          <>
            <p>Saisissez le code à 6 chiffres affiché par votre application d'authentification.</p>
            <CodeField key="code" />
          </>
        ) : (
          <>
            <p>Saisissez l'un de vos codes de secours. Chacun ne sert qu'une fois.</p>
            <Field key="backup" label="Code de secours" name="code" autoComplete="off" />
          </>
        )}
      </Form>
    );
  }

  const query = params.get('redirect') ? `?redirect=${encodeURIComponent(redirect)}` : '';
  return (
    <Form
      title="Connexion"
      submitLabel="Se connecter"
      pending={pending}
      error={error ?? passkeyError}
      onSubmit={submit}
      footer={
        <>
          <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
          {isInvitationPath(redirect) && <Link to={`/inscription${query}`}>Créer un compte</Link>}
        </>
      }
    >
      {passkeysSupported() && (
        <>
          <button type="button" className="secondary" onClick={() => void signInWithPasskey()}>
            Se connecter avec Face ID
          </button>
          <p className="separator">ou</p>
        </>
      )}
      <Field label="Adresse e-mail" name="email" type="email" autoComplete="username webauthn" />
      <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" />
    </Form>
  );
}
