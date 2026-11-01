// Surlignage d'une réserve dans la page du PDF : on cherche son texte parmi les morceaux de texte
// de la page (pdf.js), en ignorant casse, accents, espaces, ponctuation et retours à la ligne.

/** Caractère comparable : minuscule sans accent, ou '' pour ce qui n'est ni lettre ni chiffre. */
function comparable(char: string): string {
  const base = char.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /^[a-z0-9]$/.test(base) ? base : '';
}

/**
 * Indices des morceaux de texte qui contiennent le passage cherché. On essaie le texte entier,
 * puis son début, puis un extrait du milieu : l'extraction a pu corriger une coupure de ligne.
 */
export function findHighlight(items: string[], needle: string): number[] {
  let haystack = '';
  const owner: number[] = [];
  items.forEach((item, index) => {
    for (const char of item) {
      const c = comparable(char);
      if (!c) continue;
      haystack += c;
      owner.push(index);
    }
  });
  const target = [...needle].map(comparable).join('');
  if (target.length < 4) return [];

  const middle = Math.max(0, Math.floor(target.length / 2) - 15);
  const attempts = [
    { offset: 0, text: target },
    { offset: 0, text: target.slice(0, 60) },
    { offset: 0, text: target.slice(0, 30) },
    { offset: middle, text: target.slice(middle, middle + 30) },
  ];
  for (const { offset, text } of attempts) {
    const found = haystack.indexOf(text);
    if (found === -1) continue;
    // Le passage trouvé est prolongé tant que la page et le texte cherché coïncident.
    let first = found;
    let last = found + text.length - 1;
    for (let i = offset - 1; i >= 0 && haystack[first - 1] === target[i]; i--) first--;
    for (let i = offset + text.length; i < target.length && haystack[last + 1] === target[i]; i++)
      last++;
    return [...new Set(owner.slice(first, last + 1))];
  }
  return [];
}
