import { Ellipsis } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Bouton « Plus » qui déroule des actions secondaires. Se ferme sur Échap, un clic à côté ou
 * le choix d'une action (sauf une action en deux temps, qui garde le menu ouvert).
 */
export function MenuButton({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !root.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className="quiet menu-button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
      >
        <Ellipsis size={18} strokeWidth={1.5} aria-hidden />
        {label}
      </button>
      {open && (
        <div
          className="menu-pop"
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest('[data-close-menu]')) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
