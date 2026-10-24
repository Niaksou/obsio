import { Link, Outlet, useNavigate } from 'react-router';
import { authClient } from '../auth-client.js';

export function Layout() {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    navigate('/connexion', { replace: true });
  }

  return (
    <>
      <header className="header">
        <Link to="/" className="brand">
          Vérifications électriques
        </Link>
        {session && (
          <div className="session">
            <span>{session.user.name}</span>
            <button type="button" className="link" onClick={signOut}>
              Se déconnecter
            </button>
          </div>
        )}
      </header>
      <main className="main">
        <Outlet />
      </main>
    </>
  );
}
