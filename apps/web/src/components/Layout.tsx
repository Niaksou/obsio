import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { authClient } from '../auth-client.js';

/** Choix de l'organisation active, affiché seulement si l'utilisateur en a plusieurs. */
function OrganisationSwitcher() {
  const { data: organisations } = authClient.useListOrganizations();
  const { data: active } = authClient.useActiveOrganization();
  if (!organisations || organisations.length < 2) return null;

  return (
    <select
      aria-label="Organisation"
      value={active?.id ?? ''}
      onChange={(event) =>
        void authClient.organization.setActive({ organizationId: event.target.value })
      }
    >
      {!active && <option value="">Choisir une organisation</option>}
      {organisations.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function Layout({ fullBleed = false }: { fullBleed?: boolean }) {
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
          Obsio
        </Link>
        {session && (
          <nav className="nav" aria-label="Navigation principale">
            <NavLink to="/" end>
              Sites
            </NavLink>
            <NavLink to="/organisation">Organisation</NavLink>
          </nav>
        )}
        {session && (
          <div className="session">
            <OrganisationSwitcher />
            <span>{session.user.name}</span>
            <button type="button" className="link" onClick={signOut}>
              Se déconnecter
            </button>
          </div>
        )}
      </header>
      <main className={fullBleed ? 'main main-full' : 'main'}>
        <Outlet />
      </main>
    </>
  );
}
