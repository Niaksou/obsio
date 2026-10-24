import { loadFixtures } from './fixtures.js';

// Vérifie que chaque résultat attendu respecte le schéma et a son PDF : pnpm fixtures:check
const fixtures = await loadFixtures();
if (fixtures.length === 0) {
  console.log('Aucun résultat attendu trouvé dans fixtures/reports/.');
  process.exit(1);
}
for (const { id, expected } of fixtures) {
  const reconduites = expected.reserves.filter((r) => r.nouvelleOuReconduite === 'reconduite');
  console.log(
    `${id.padEnd(36)} ${expected.organisme.padEnd(32)} ${String(expected.reserves.length).padStart(3)} réserves (${reconduites.length} reconduites)`,
  );
}
const total = fixtures.reduce((sum, f) => sum + f.expected.reserves.length, 0);
console.log(`\n${fixtures.length} rapports, ${total} réserves attendues.`);
