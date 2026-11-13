import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withOrganisation } from '../src/db/client.js';
import { issuedDocument } from '../src/db/schema/index.js';
import { buildTestApp, clientHelpers, resetDatabase, seedReserves, TestClient } from './helpers.js';

const ctx = await buildTestApp();
const { openClient } = clientHelpers(ctx);
afterAll(() => ctx.close());

let admin: TestClient;
let organisationId: string;
let siteId: string;

beforeEach(async () => {
  await resetDatabase();
  ({ admin, organisationId } = await openClient('Usine Dupont', 'Alice', 'alice@dupont.fr'));
  siteId = (await admin.post('/api/sites', { name: 'Usine de Lyon' })).json().id;
  await seedReserves(ctx, organisationId, siteId, 'alice@dupont.fr', 2);
});

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

describe('documents émis : dossier signé et vérifiable', () => {
  it('signe le dossier, enregistre son empreinte et le reconnaît sur la page publique', async () => {
    const response = await admin.post(`/api/sites/${siteId}/proof-dossier`, {});
    expect(response.statusCode).toBe(200);
    const pdf = response.rawPayload;
    // Signature PDF détachée, sur tout le fichier sauf la signature elle-même.
    expect(pdf.includes('/adbe.pkcs7.detached')).toBe(true);
    expect(pdf.includes('/ByteRange')).toBe(true);
    expect(response.headers['content-disposition']).toMatch(
      /dossier-preuves-\d{4}-\d{2}-\d{2}-[0-9A-F]{4}-[0-9A-F]{4}\.pdf/,
    );

    const [row] = await withOrganisation(ctx.db, organisationId, (tx) =>
      tx.select().from(issuedDocument),
    );
    expect(row).toMatchObject({ sha256: sha256(pdf), reserveCount: 2, liftedCount: 0 });
    expect(await ctx.storage.get(row!.storageKey)).toEqual(pdf);

    // Vérification sans session : le navigateur n'envoie que l'empreinte.
    const anonymous = new TestClient(ctx);
    const verified = await anonymous.post('/api/documents/verify', { sha256: sha256(pdf) });
    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toEqual({
      number: row!.id.slice(0, 4).toUpperCase() + '-' + row!.id.slice(4, 8).toUpperCase(),
      issuedAt: row!.issuedAt.toISOString(),
      organisationName: 'Usine Dupont',
      reserveCount: 2,
      liftedCount: 0,
    });

    // Un seul octet modifié : le fichier n'est plus reconnu.
    const tampered = Buffer.from(pdf);
    tampered[tampered.length - 20] = tampered.at(-20)! ^ 1;
    const refused = await anonymous.post('/api/documents/verify', { sha256: sha256(tampered) });
    expect(refused.statusCode).toBe(404);
    expect(
      (await anonymous.post('/api/documents/verify', { sha256: 'pas une empreinte' })).statusCode,
    ).toBe(400);
  });

  it('le registre est cloisonné et inaltérable par l’application', async () => {
    await admin.post(`/api/sites/${siteId}/proof-dossier`, {});
    const other = await openClient('Usine Martin', 'Chloé', 'chloe@martin.fr');
    const seen = await withOrganisation(ctx.db, other.organisationId, (tx) =>
      tx.select().from(issuedDocument),
    );
    expect(seen).toEqual([]);
    // Sans organisation ni empreinte posée, rien n'est visible.
    expect(await ctx.db.select().from(issuedDocument)).toEqual([]);

    for (const statement of [
      sql`update issued_document set reserve_count = 0`,
      sql`delete from issued_document`,
    ]) {
      const error = await withOrganisation(ctx.db, organisationId, (tx) =>
        tx.execute(statement),
      ).catch((e: Error) => e);
      expect(String((error as Error).cause)).toMatch(/permission denied/);
    }
  });
});
