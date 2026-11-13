import { describe, expect, it } from 'vitest';
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

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

const tours: Tour[] = [
  {
    id: 'accueil',
    title: 'Accueil',
    auto: true,
    match: (path) => path === '/',
    steps: [
      { title: 'Bienvenue', body: '.' },
      { target: 'a', title: 'A', body: '.' },
    ],
  },
  {
    id: 'site',
    title: 'Site',
    match: (path) => path.startsWith('/sites/'),
    steps: [
      { target: 'b', title: 'B', body: '.' },
      { target: 'c', title: 'C', body: '.' },
    ],
  },
];

describe('tutoriels vus', () => {
  it('retient les tutoriels vus, sans doublon, et les oublie sur demande', () => {
    const storage = memoryStorage();
    expect(hasSeen('accueil', storage)).toBe(false);
    markSeen('accueil', storage);
    markSeen('accueil', storage);
    expect(hasSeen('accueil', storage)).toBe(true);
    expect(JSON.parse(storage.getItem('obsio-tutoriels-vus') ?? '')).toEqual(['accueil']);
    resetSeen(storage);
    expect(hasSeen('accueil', storage)).toBe(false);
  });

  it('ignore une valeur illisible', () => {
    const storage = memoryStorage();
    storage.setItem('obsio-tutoriels-vus', '{pas du json');
    expect(hasSeen('accueil', storage)).toBe(false);
    markSeen('site', storage);
    expect(hasSeen('site', storage)).toBe(true);
  });
});

describe('choix des tutoriels', () => {
  it('ne garde que les étapes centrées ou dont l’élément existe', () => {
    const steps = tours[1]!.steps.concat(tours[0]!.steps);
    expect(playableSteps(steps, (t) => t === 'c').map((s) => s.title)).toEqual(['C', 'Bienvenue']);
  });

  it('propose les tutoriels de la page ayant au moins un élément présent', () => {
    expect(toursFor(tours, '/sites/1', () => true).map((t) => t.id)).toEqual(['site']);
    expect(toursFor(tours, '/sites/1', () => false)).toEqual([]);
    // Une bulle centrée seule ne suffit pas à proposer le tutoriel.
    expect(toursFor(tours, '/', (t) => t === 'b')).toEqual([]);
  });

  it('lance tout seul le premier tutoriel automatique pas encore vu', () => {
    expect(autoTourFor(tours, '/', () => false)?.id).toBe('accueil');
    expect(autoTourFor(tours, '/', () => true)).toBeNull();
    expect(autoTourFor(tours, '/sites/1', () => false)).toBeNull();
  });

  it('reste peu verbeux : identifiants uniques, une phrase courte par étape', () => {
    const ids = TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tour of TOURS) {
      // Étapes propres à l'ordinateur ou au téléphone comprises : moins sur chaque appareil.
      expect(tour.steps.length).toBeLessThanOrEqual(9);
      for (const step of tour.steps) {
        expect(step.body.length, `${tour.id} : ${step.title}`).toBeLessThanOrEqual(90);
        expect(step.title.length).toBeLessThanOrEqual(40);
      }
    }
  });
});

describe('placeBubble', () => {
  const viewport = { width: 1200, height: 800 };
  const bubble = { width: 320, height: 150 };

  it('place la bulle sous l’élément, centrée sur lui, à distance du contour', () => {
    const target = { top: 100, bottom: 140, left: 500, width: 200 };
    expect(placeBubble(target, viewport, bubble)).toEqual({
      placement: 'below',
      top: 162,
      left: 440,
    });
  });

  it('pose la bulle à droite d’un élément de la barre latérale', () => {
    const target = { top: 120, bottom: 156, left: 12, width: 216 };
    expect(placeBubble(target, viewport, bubble)).toEqual({
      placement: 'beside',
      top: 114,
      left: 250,
    });
    // Élément en bas de la barre (Mon compte) : la bulle remonte pour rester dans l’écran.
    const account = { top: 760, bottom: 790, left: 12, width: 216 };
    expect(placeBubble(account, viewport, bubble).top).toBe(626);
  });

  it('passe au-dessus en bas d’écran, et garde 24 px avec les bords', () => {
    const target = { top: 700, bottom: 740, left: 1150, width: 40 };
    expect(placeBubble(target, viewport, bubble)).toEqual({
      placement: 'above',
      top: 528,
      left: 856,
    });
  });

  it('centre la bulle sans élément ou quand il occupe tout l’écran', () => {
    expect(placeBubble(null, viewport, bubble).placement).toBe('center');
    const huge = { top: 20, bottom: 780, left: 0, width: 1200 };
    expect(placeBubble(huge, viewport, bubble)).toEqual({
      placement: 'center',
      top: 325,
      left: 440,
    });
  });

  it('passe en haut de l’écran du téléphone quand l’élément est en bas (barre d’onglets)', () => {
    const target = { top: 780, bottom: 830, left: 10, width: 90 };
    expect(placeBubble(target, { width: 390, height: 844 }, bubble)).toEqual({
      placement: 'sheet-top',
      top: 12,
      left: 12,
    });
  });

  it('pose la bulle en bas de l’écran sur un téléphone', () => {
    const target = { top: 100, bottom: 140, left: 10, width: 100 };
    expect(placeBubble(target, { width: 390, height: 844 }, bubble)).toEqual({
      placement: 'sheet',
      top: 682,
      left: 12,
    });
  });
});
