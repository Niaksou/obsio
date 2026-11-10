import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router';
import {
  autoTourFor,
  hasSeen,
  markSeen,
  placeBubble,
  playableSteps,
  resetSeen,
  toursFor,
  type Tour,
} from './engine.js';
import { TOURS } from './tours.js';

/** Élément visible portant `data-tour="name"`. Ouvre le bloc replié (details) qui le cache. */
export function findTarget(name: string, reveal = false): HTMLElement | null {
  const elements = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(name)}"]`);
  for (const element of elements) {
    if (element.getClientRects().length > 0) return element;
  }
  if (reveal) {
    for (const element of elements) {
      const closed = element.closest('details:not([open])');
      if (closed instanceof HTMLDetailsElement) {
        closed.open = true;
        if (element.getClientRects().length > 0) return element;
      }
    }
  }
  return null;
}

const exists = (name: string) => {
  const elements = document.querySelectorAll(`[data-tour="${CSS.escape(name)}"]`);
  return elements.length > 0;
};

interface TourContextValue {
  start: (tour: Tour) => void;
  /** Tutoriels jouables sur la page affichée. */
  available: () => Tour[];
  /** Les tutoriels automatiques se relanceront. */
  replayAll: () => void;
  /** Un tutoriel de cette page n'a pas encore été vu. */
  unseen: boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTours() {
  const value = useContext(TourContext);
  if (!value) throw new Error('useTours hors de TourProvider');
  return value;
}

/** Délai pour trouver l'élément d'une étape (données encore en chargement, volet qui s'ouvre). */
const WAIT_MS = 1500;
/** En cours de tutoriel, la page est chargée : une étape absente est sautée plus vite. */
const SKIP_MS = 400;

export function TourProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [tour, setTour] = useState<Tour | null>(null);
  const [unseen, setUnseen] = useState(false);
  const tourPath = useRef<string | null>(null);

  const start = useCallback(
    (next: Tour) => {
      tourPath.current = pathname;
      setTour(next);
    },
    [pathname],
  );

  const finish = useCallback(() => {
    setTour((current) => {
      if (current) markSeen(current.id);
      return null;
    });
    setUnseen(false);
  }, []);

  // Changement de page : le tutoriel en cours s'arrête (il est compté comme vu).
  useEffect(() => {
    if (tour && tourPath.current !== pathname) finish();
  }, [pathname, tour, finish]);

  // Première visite : lancement automatique, une fois la page chargée ; sinon pastille sur le
  // bouton Tutoriels si un tutoriel de la page n'a pas été vu.
  useEffect(() => {
    if (tour) return;
    const timer = window.setTimeout(() => {
      const playable = toursFor(TOURS, pathname, exists);
      const auto = autoTourFor(playable, pathname, (id) => hasSeen(id));
      if (auto) start(auto);
      else setUnseen(playable.some((t) => !hasSeen(t.id)));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [pathname, tour, start]);

  const value = useMemo<TourContextValue>(
    () => ({
      start,
      available: () => toursFor(TOURS, pathname, exists),
      replayAll: () => {
        resetSeen();
        setUnseen(toursFor(TOURS, pathname, exists).length > 0);
      },
      unseen,
    }),
    [start, pathname, unseen],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {tour && <TourOverlay key={tour.id} tour={tour} onClose={finish} />}
    </TourContext.Provider>
  );
}

type Rect = { top: number; left: number; width: number; height: number; bottom: number };

function TourOverlay({ tour, onClose }: { tour: Tour; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  // Élément trouvé pour une étape donnée : tant qu'il ne correspond pas à l'étape courante,
  // la recherche est en cours.
  const [found, setFound] = useState<{ index: number; element: HTMLElement } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 320, height: 160 });
  const bubble = useRef<HTMLDivElement>(null);
  const step = tour.steps[index];
  const target = step?.target && found?.index === index ? found.element : null;
  const searching = Boolean(step?.target) && !target;

  const go = useCallback(
    (delta: 1 | -1) => {
      const next = index + delta;
      if (next < 0) return;
      if (next >= tour.steps.length) onClose();
      else {
        setDirection(delta);
        setIndex(next);
      }
    },
    [index, tour.steps.length, onClose],
  );

  // Recherche de l'élément de l'étape ; absent après le délai, l'étape est sautée.
  useEffect(() => {
    if (!step?.target) return;
    const name = step.target;
    const startedAt = Date.now();
    let timer = 0;
    const look = () => {
      const element = findTarget(name, true);
      if (element) {
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        setFound({ index, element });
      } else if (Date.now() - startedAt > (found ? SKIP_MS : WAIT_MS)) {
        // Élément absent (droits, page vide) : étape sautée, dans le sens de la navigation.
        const next = index + direction < 0 ? index + 1 : index + direction;
        if (next >= tour.steps.length) onClose();
        else {
          if (next > index) setDirection(1);
          setIndex(next);
        }
      } else {
        timer = window.setTimeout(look, 100);
      }
    };
    timer = window.setTimeout(look, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relancé à chaque étape seulement
  }, [index]);

  // Étape à faire : toucher l'élément fait avancer, le temps que l'application réagisse.
  useEffect(() => {
    if (!target || step?.action !== 'click') return;
    const onClick = () => window.setTimeout(() => go(1), 250);
    target.addEventListener('click', onClick);
    return () => target.removeEventListener('click', onClick);
  }, [target, step, go]);

  // Suivi de l'élément et de la taille de la bulle (défilement, redimensionnement, contenu
  // qui bouge), à chaque image.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const r = target?.getBoundingClientRect();
      setRect((previous) =>
        !r
          ? null
          : previous &&
              previous.top === r.top &&
              previous.left === r.left &&
              previous.width === r.width &&
              previous.height === r.height
            ? previous
            : { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom },
      );
      const node = bubble.current;
      if (node) {
        const { width, height } = node.getBoundingClientRect();
        setBubbleSize((previous) =>
          previous.width === width && previous.height === height ? previous : { width, height },
        );
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  // Clavier : Échap ferme, flèches pour naviguer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') go(1);
      else if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // La bulle prend le focus à chaque étape, pour les lecteurs d'écran et le clavier.
  useEffect(() => {
    if (!searching) bubble.current?.focus({ preventScroll: true });
  }, [searching, index]);

  if (!step || searching) return null;

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const shown = target ? rect : null;
  const position = placeBubble(shown, viewport, bubbleSize);
  // Compteur sur les étapes jouables ici (celles dont l'élément existe dans la page).
  const visible = playableSteps(tour.steps, exists);
  const number = Math.max(1, visible.indexOf(step) + 1);
  const last = !tour.steps.slice(index + 1).some((s) => !s.target || exists(s.target));
  const pad = 6;

  return (
    <div className="tour" aria-live="polite">
      {shown ? (
        <div
          className="tour-spotlight"
          style={{
            top: shown.top - pad,
            left: shown.left - pad,
            width: shown.width + pad * 2,
            height: shown.height + pad * 2,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={bubble}
        className={`tour-bubble tour-${position.placement}`}
        style={{ top: position.top, left: position.left }}
        role="dialog"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
      >
        <p className="tour-meta">
          {tour.title} · {number}/{Math.max(number, visible.length)}
        </p>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="link" onClick={onClose}>
            Passer
          </button>
          <span>
            {index > 0 && (
              <button type="button" className="quiet" onClick={() => go(-1)}>
                Précédent
              </button>
            )}
            <button
              type="button"
              className={step.action ? 'secondary' : undefined}
              onClick={() => go(1)}
            >
              {last ? 'Terminer' : step.action ? 'Passer l’étape' : 'Suivant'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
