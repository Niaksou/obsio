import { GraduationCap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Tour } from './engine.js';
import { useTours } from './TourProvider.js';

/** Bouton « Tutoriels » : rejoue les tutoriels de la page affichée. */
export function HelpButton({ compact = false }: { compact?: boolean }) {
  const { available, start, replayAll, unseen } = useTours();
  const [open, setOpen] = useState(false);
  const [tours, setTours] = useState<Tour[]>([]);
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

  function toggle() {
    if (!open) setTours(available());
    setOpen(!open);
  }

  return (
    <div className="help" ref={root}>
      <button
        type="button"
        className="quiet help-button"
        aria-expanded={open}
        aria-haspopup="menu"
        data-tour="tutoriels"
        onClick={toggle}
      >
        <GraduationCap size={18} strokeWidth={1.5} aria-hidden />
        <span className={compact ? 'visually-hidden' : undefined}>Tutoriels</span>
        {unseen && <span className="help-dot" aria-label="nouveau" />}
      </button>
      {open && (
        <div className="help-menu" role="menu">
          {tours.length === 0 ? (
            <p className="hint">Aucun tutoriel sur cette page.</p>
          ) : (
            tours.map((tour) => (
              <button
                key={tour.id}
                type="button"
                role="menuitem"
                className="quiet"
                onClick={() => {
                  setOpen(false);
                  start(tour);
                }}
              >
                {tour.title}
              </button>
            ))
          )}
          {!compact && (
            <button
              type="button"
              role="menuitem"
              className="link"
              onClick={() => {
                replayAll();
                setOpen(false);
              }}
            >
              Revoir les tutoriels d’accueil
            </button>
          )}
        </div>
      )}
    </div>
  );
}
