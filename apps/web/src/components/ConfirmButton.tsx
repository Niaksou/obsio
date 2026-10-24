import { useState } from 'react';

/**
 * Bouton d'action en deux temps (sans boîte de dialogue du navigateur) : le premier clic
 * demande confirmation, le second exécute.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="quiet" disabled={disabled} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm">
      <button type="button" className="danger" disabled={disabled} onClick={onConfirm}>
        {confirmLabel}
      </button>
      <button type="button" className="quiet" onClick={() => setArmed(false)}>
        Annuler
      </button>
    </span>
  );
}
