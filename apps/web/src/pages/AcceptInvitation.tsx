import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { authClient, errorMessage } from '../auth-client.js';
import { useSubmit } from '../components/useSubmit.js';

interface InvitationDetails {
  organizationName: string;
  inviterEmail: string;
  role: string;
}

export function AcceptInvitation() {
  const { id = '' } = useParams();
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();

  if (isPending) return <p className="loading">Chargement…</p>;
  if (!session) {
    const redirect = encodeURIComponent(location.pathname);
    return (
      <div className="card">
        <h1>Invitation</h1>
        <p>
          Pour rejoindre l'organisation, connectez-vous ou créez un compte avec l'adresse qui a reçu
          l'invitation.
        </p>
        <div className="footer">
          <Link to={`/inscription?redirect=${redirect}`}>Créer un compte</Link>
          <Link to={`/connexion?redirect=${redirect}`}>J'ai déjà un compte</Link>
        </div>
      </div>
    );
  }
  return <InvitationForSession invitationId={id} />;
}

function InvitationForSession({ invitationId }: { invitationId: string }) {
  const navigate = useNavigate();
  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { pending, error, run } = useSubmit();

  useEffect(() => {
    void authClient.organization.getInvitation({ query: { id: invitationId } }).then((result) => {
      if (result.data) setDetails(result.data);
      else setLoadError(errorMessage(result.error));
    });
  }, [invitationId]);

  async function accept() {
    const ok = await run(() => authClient.organization.acceptInvitation({ invitationId }));
    if (ok) navigate('/', { replace: true });
  }

  if (loadError) {
    return (
      <div className="card">
        <h1>Invitation</h1>
        <p className="error">{loadError}</p>
        <Link to="/">Retour à l'accueil</Link>
      </div>
    );
  }
  if (!details) return <p className="loading">Chargement…</p>;

  return (
    <div className="card">
      <h1>Rejoindre {details.organizationName}</h1>
      <p>
        {details.inviterEmail} vous invite à rejoindre l'organisation en tant que{' '}
        {details.role === 'admin' ? 'administrateur' : 'membre'}.
      </p>
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={accept} disabled={pending}>
        {pending ? 'Veuillez patienter…' : "Accepter l'invitation"}
      </button>
    </div>
  );
}
