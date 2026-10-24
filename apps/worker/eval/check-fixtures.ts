import { countReserves } from '@obsio/shared';
import { loadFixtures } from './fixtures.js';

// Vérifie que chaque résultat attendu respecte le schéma et a son PDF : pnpm fixtures:check
const fixtures = await loadFixtures();
if (fixtures.length === 0) {
  console.log('Aucun résultat attendu trouvé dans fixtures/reports/.');
  process.exit(1);
}
for (const { id, expected } of fixtures) {
  for (const document of expected.documents) {
    const reconduites = document.reserves.filter((r) => r.nouvelleOuReconduite === 'reconduite');
    console.log(
      `${id.padEnd(40)} ${document.type.padEnd(10)} ${document.organisme.padEnd(28)} ${String(document.reserves.length).padStart(3)} réserves (${reconduites.length} reconduites)`,
    );
  }
}
const total = fixtures.reduce((sum, f) => sum + countReserves(f.expected), 0);
console.log(`\n${fixtures.length} rapports, ${total} réserves attendues.`);
