import { Factory, CalendarCheck, HardHat, LogOut, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { authClient } from '../auth-client.js';
import { Logo } from './Logo.js';

const SITE_PATHS = /^\/(?:$|sites\/|reserves\/|etages\/|imports\/|batiments\/)/;

/** Icônes de l'interface : une seule taille, un seul trait, couleur du texte. */
const iconProps = { size: 18, strokeWidth: 1.5, 'aria-hidden': true } as const;

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

/** Marque : le logo, qui ramène à la liste des sites. */
function Brand() {
  return (
    <Link to="/" className="brand">
      <Logo />
    </Link>
  );
}

function NavItem({
  to,
  icon,
  active,
  children,
}: {
  to: string;
  icon: ReactNode;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={
        active === undefined ? undefined : ({ isActive }) => (active || isActive ? 'active' : '')
      }
    >
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}

export function Layout({ fullBleed = false }: { fullBleed?: boolean }) {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();
  // Tout ce qui se trouve dans un site (plans, réserves, rapports) relève de la rubrique Sites.
  const inSites = SITE_PATHS.test(useLocation().pathname);
  const main = (
    <main className={fullBleed ? 'main main-full' : 'main'}>
      <Outlet />
    </main>
  );

  async function signOut() {
    await authClient.signOut();
    navigate('/connexion', { replace: true });
  }

  // Sans session (connexion, invitation) : la marque seule au-dessus du formulaire.
  if (!session) {
    return (
      <div className="public">
        <header className="public-head">
          <Brand />
        </header>
        {main}
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav" aria-label="Navigation principale">
          <NavItem to="/" icon={<Factory {...iconProps} />} active={inSites}>
            Sites
          </NavItem>
          <NavItem to="/verifications" icon={<CalendarCheck {...iconProps} />}>
            Vérifications
          </NavItem>
          <NavItem to="/intervenants" icon={<HardHat {...iconProps} />}>
            Intervenants
          </NavItem>
          <NavItem to="/organisation" icon={<Users {...iconProps} />}>
            Organisation
          </NavItem>
        </nav>
        <div className="session">
          <OrganisationSwitcher />
          <Link to="/compte" className="session-user" title="Mon compte">
            {session.user.name}
          </Link>
          <button type="button" className="quiet session-out" onClick={signOut}>
            <LogOut {...iconProps} />
            <span>Se déconnecter</span>
          </button>
        </div>
      </aside>
      {main}
    </div>
  );
}
