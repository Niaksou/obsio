import { useId, type ReactNode } from 'react';

// Page de réglages (Mon compte) : des groupes titrés, chacun une seule surface découpée en
// lignes « libellé, état en une phrase, action ». Les formulaires restent repliés.

export function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="settings-group" aria-labelledby={id}>
      <div className="settings-intro">
        <h2 id={id}>{title}</h2>
        {description && <p className="hint">{description}</p>}
      </div>
      <div className="settings-panel">{children}</div>
    </section>
  );
}

export function Setting({
  title,
  status,
  action,
  tour,
  children,
}: {
  title: string;
  /** État ou rôle du réglage, une phrase courte. */
  status?: ReactNode;
  action?: ReactNode;
  /** Repère des tutoriels. */
  tour?: string;
  /** Détail sous la ligne : liste, formulaire déplié, message. */
  children?: ReactNode;
}) {
  return (
    <div className="setting" data-tour={tour}>
      <div className="setting-head">
        <div className="setting-text">
          <h3>{title}</h3>
          {status && <p>{status}</p>}
        </div>
        {action && <div className="setting-action">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/** Éléments d'un réglage (clés, sessions) : nom, précision, action. */
export function SettingItems({ children }: { children: ReactNode }) {
  return <ul className="setting-items">{children}</ul>;
}

export function SettingItem({
  name,
  detail,
  action,
}: {
  name: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li>
      <span className="setting-item-text">
        <span>{name}</span>
        {detail && <small>{detail}</small>}
      </span>
      {action}
    </li>
  );
}
