import { CalendarCheck, ClipboardCheck, Factory, HardHat, LogOut, Menu, Users } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { authClient } from '../auth-client.js';
import { disablePush } from '../push/push.js';
import { HelpButton } from '../tours/HelpButton.js';
import { useTours } from '../tours/TourProvider.js';
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
  tour,
  children,
}: {
  to: string;
  icon: ReactNode;
  active?: boolean;
  /** Repère des tutoriels. */
  tour?: string;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      data-tour={tour}
      className={
        active === undefined ? undefined : ({ isActive }) => (active || isActive ? 'active' : '')
      }
    >
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}

/** Initiales du nom affiché (« Camille Test » → « CT »). */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters.map((part) => part!.charAt(0).toLocaleUpperCase('fr')).join('') || '?';
}

/** Lien vers « Mon compte » : pastille aux initiales, nom, et ce que fait le lien. */
function AccountLink({ name }: { name: string }) {
  return (
    <NavLink to="/compte" className="account-link" data-tour="account-link">
      <span className="avatar" aria-hidden>
        {initials(name)}
      </span>
      <span className="account-text">
        <span className="account-name">{name}</span>
        <small>Mon compte</small>
      </span>
    </NavLink>
  );
}

/**
 * Volet « Plus » de la barre d'onglets (téléphone) : compte, rubriques secondaires,
 * tutoriels, organisation et déconnexion. Fenêtre modale native (focus, Échap).
 */
function MoreSheet({
  open,
  onClose,
  name,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  onSignOut: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="more"
      aria-label="Plus"
      onClose={onClose}
      // Toucher le fond (hors du volet) le ferme.
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="more-body">
        <AccountLink name={name} />
        <nav className="nav" aria-label="Autres rubriques">
          <NavItem to="/intervenants" icon={<HardHat {...iconProps} />}>
            Intervenants
          </NavItem>
          <NavItem to="/organisation" icon={<Users {...iconProps} />}>
            Organisation
          </NavItem>
        </nav>
        <div className="more-session">
          <HelpButton inline onStart={onClose} />
          <OrganisationSwitcher />
          <button type="button" className="quiet session-out" onClick={onSignOut}>
            <LogOut {...iconProps} />
            <span>Se déconnecter</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function Layout({ fullBleed = false }: { fullBleed?: boolean }) {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { unseen } = useTours();
  const [moreOpen, setMoreOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  // Le volet se ferme dès qu'on change de page.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMoreOpen(false);
  }
  // Tout ce qui se trouve dans un site (plans, réserves, rapports) relève de la rubrique Sites.
  const inSites = SITE_PATHS.test(pathname);
  const inMore = /^\/(?:compte|intervenants|organisation)(?:\/|$)/.test(pathname);
  const main = (
    <main className={fullBleed ? 'main main-full' : 'main'}>
      <Outlet />
    </main>
  );

  async function signOut() {
    // L'appareil ne reçoit plus les notifications de ce compte (un autre peut s'y connecter).
    await disablePush().catch(() => undefined);
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
          <NavItem tour="nav-sites" to="/" icon={<Factory {...iconProps} />} active={inSites}>
            Sites
          </NavItem>
          <NavItem
            tour="nav-mes-reserves"
            to="/mes-reserves"
            icon={<ClipboardCheck {...iconProps} />}
          >
            Mes réserves
          </NavItem>
          <NavItem
            tour="nav-verifications"
            to="/verifications"
            icon={<CalendarCheck {...iconProps} />}
          >
            Échéances de contrôle
          </NavItem>
          <NavItem tour="nav-intervenants" to="/intervenants" icon={<HardHat {...iconProps} />}>
            Intervenants
          </NavItem>
          <NavItem to="/organisation" icon={<Users {...iconProps} />}>
            Organisation
          </NavItem>
        </nav>
        <div className="session">
          <HelpButton />
          <OrganisationSwitcher />
          <AccountLink name={session.user.name} />
          <button type="button" className="quiet session-out" onClick={signOut}>
            <LogOut {...iconProps} />
            <span>Se déconnecter</span>
          </button>
        </div>
      </aside>
      {main}
      {/* Téléphone : barre d'onglets en bas, à portée du pouce. */}
      <nav className="tabbar" aria-label="Navigation principale">
        <NavItem
          tour="nav-mes-reserves"
          to="/mes-reserves"
          icon={<ClipboardCheck {...iconProps} />}
        >
          Mes réserves
        </NavItem>
        <NavItem tour="nav-sites" to="/" icon={<Factory {...iconProps} />} active={inSites}>
          Sites
        </NavItem>
        <NavItem
          tour="nav-verifications"
          to="/verifications"
          icon={<CalendarCheck {...iconProps} />}
        >
          Échéances
        </NavItem>
        <button
          type="button"
          className={inMore ? 'active' : undefined}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          data-tour="nav-plus"
          onClick={() => setMoreOpen(true)}
        >
          <Menu {...iconProps} />
          <span>Plus</span>
          {unseen && <span className="help-dot" aria-label="nouveau tutoriel" />}
        </button>
      </nav>
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        name={session.user.name}
        onSignOut={() => void signOut()}
      />
    </div>
  );
}
