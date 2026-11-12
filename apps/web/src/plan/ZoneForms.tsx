import type { Zone } from '@obsio/shared';
import { useState } from 'react';
import { ConfirmButton } from '../components/ConfirmButton.js';

/** Nom de la zone qu'on vient de tracer, posé sur le plan comme le calibrage. */
export function ZoneNameForm({
  pending,
  error,
  onSubmit,
  onRestart,
}: {
  pending: boolean;
  error: Error | null;
  onSubmit: (name: string) => void;
  onRestart: () => void;
}) {
  return (
    <form
      className="calibration-form"
      onSubmit={(event) => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
        if (name) onSubmit(name);
      }}
    >
      <label>
        Nom de la zone
        <input
          name="name"
          required
          maxLength={200}
          autoFocus
          autoComplete="off"
          placeholder="Atelier, quai B, local TGBT"
        />
      </label>
      <div className="actions">
        <button type="submit" disabled={pending}>
          Enregistrer la zone
        </button>
        <button type="button" className="secondary" onClick={onRestart}>
          Retracer
        </button>
      </div>
      {error && <p className="error">{error.message}</p>}
    </form>
  );
}

/** Renommer ou retirer la zone choisie (admin). Les équipements restent à leur place. */
export function ZoneActions({
  zone,
  pending,
  error,
  onRename,
  onArchive,
}: {
  zone: Zone;
  pending: boolean;
  error: Error | null;
  onRename: (name: string) => void;
  onArchive: () => void;
}) {
  const [renaming, setRenaming] = useState(false);

  if (renaming) {
    return (
      <form
        className="zone-rename"
        onSubmit={(event) => {
          event.preventDefault();
          const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
          if (!name) return;
          onRename(name);
          setRenaming(false);
        }}
      >
        <input
          name="name"
          aria-label="Nom de la zone"
          required
          maxLength={200}
          autoFocus
          defaultValue={zone.name}
        />
        <button type="submit" disabled={pending}>
          Renommer
        </button>
        <button type="button" className="quiet" onClick={() => setRenaming(false)}>
          Annuler
        </button>
      </form>
    );
  }

  return (
    <div className="zone-actions">
      <button type="button" className="quiet" onClick={() => setRenaming(true)}>
        Renommer
      </button>
      <ConfirmButton
        label="Retirer la zone"
        confirmLabel="Retirer la zone du plan"
        disabled={pending}
        onConfirm={onArchive}
      />
      {error && <p className="error">{error.message}</p>}
    </div>
  );
}
