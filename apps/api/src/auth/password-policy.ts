// Mots propres au contexte d'Obsio, refusés dans un mot de passe (ASVS 6.1.2, 6.2.11) : un
// attaquant les essaie en premier. Liste documentée dans docs/securite.md.
export const CONTEXT_WORDS = [
  'obsio',
  'motdepasse',
  'password',
  'azerty',
  'qwerty',
  'electricite',
  'electrique',
  'electricien',
  'verification',
  'conformite',
  'reserve',
  'apsad',
];

/** Minuscules, sans accents ni séparateurs : « Électricité-2026 » devient « electricite2026 ». */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Premier mot interdit contenu dans le mot de passe, ou null. Les mots personnels (nom, partie
 * locale de l'adresse e-mail) s'ajoutent à la liste à partir de 4 caractères.
 */
export function forbiddenWord(
  password: string,
  personal: (string | undefined)[] = [],
): string | null {
  const candidate = normalize(password);
  const words = [
    ...CONTEXT_WORDS,
    ...personal
      .flatMap((value) => (value ?? '').split(/[@\s]/).slice(0, 2))
      .map(normalize)
      .filter((word) => word.length >= 4),
  ];
  return words.find((word) => candidate.includes(word)) ?? null;
}
