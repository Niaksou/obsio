import { PassThrough } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { organisationPrefix } from '@obsio/shared';
import { eq, getTableName, inArray, sql } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, withOrganisation } from '../src/db/client.js';
import {
  member,
  organisation,
  reportImport,
  reserve,
  reserveEvent,
  user,
} from '../src/db/schema/index.js';
import { seedDemo } from '../src/demo/seed.js';
import { ORGANISATION_TABLES } from '../src/organisations/data.js';
import {
  DeletionError,
  deleteOrganisation,
  planOrganisationDeletion,
} from '../src/organisations/delete.js';
import { exportOrganisation } from '../src/organisations/export.js';
import { buildTestApp, clientHelpers, resetDatabase, TestClient } from './helpers.js';

const ctx = await buildTestApp();
const { openClient, invite, join } = clientHelpers(ctx);
// La suppression passe par le rôle propriétaire, comme la commande pnpm org:delete.
const owner = createDatabase(process.env.TEST_DATABASE_OWNER_URL!);
afterAll(async () => {
  await owner.pool.end();
  await ctx.close();
});

let orgA: string;
let orgB: string;

/** Inscrit un utilisateur invité dans une première organisation. */
async function newMember(admin: TestClient, name: string, email: string) {
  const client = new TestClient(ctx);
  const invitationId = await invite(admin, email, 'membre');
  await client.signUpAndVerify(name, email);
  await join(client, invitationId);
  return client;
}

beforeEach(async () => {
  await resetDatabase();
  const a = await openClient('Usine A', 'Alice', 'alice@a.fr');
  const b = await openClient('Usine B', 'Bruno', 'bruno@b.fr');
  orgA = a.organisationId;
  orgB = b.organisationId;
  const deps = { db: ctx.db, storage: ctx.storage, webUrl: ctx.config.WEB_URL };
  await seedDemo(deps, { adminEmail: 'alice@a.fr', organisationId: orgA, on: '2026-11-03' });
  await seedDemo(deps, { adminEmail: 'bruno@b.fr', organisationId: orgB, on: '2026-11-03' });
  // Carole intervient dans les deux usines ; David n'est que dans A.
  const carole = await newMember(a.admin, 'Carole', 'carole@exemple.fr');
  await join(carole, await invite(b.admin, 'carole@exemple.fr', 'membre'));
  await newMember(a.admin, 'David', 'david@a.fr');
});

async function exportArchive(organisationId: string) {
  const [found] = await ctx.db
    .select()
    .from(organisation)
    .where(eq(organisation.id, organisationId));
  const output = new PassThrough();
  const content = buffer(output);
  const summary = await exportOrganisation(ctx, found!, output);
  output.end();
  return { summary, files: unzipSync(new Uint8Array(await content)) };
}

const json = (files: Record<string, Uint8Array>, name: string) =>
  JSON.parse(strFromU8(files[`json/${name}.json`]!)) as Record<string, unknown>[];

describe("export des données d'une organisation", () => {
  it("contient ses données et ses fichiers, rien de l'autre organisation", async () => {
    const { summary, files } = await exportArchive(orgA);

    for (const { table } of ORGANISATION_TABLES) {
      const rows = json(files, getTableName(table));
      expect(rows.every((row) => row.organisation_id === orgA)).toBe(true);
      expect(files[`csv/${getTableName(table)}.csv`]).toBeDefined();
    }
    expect(json(files, 'reserve').length).toBeGreaterThan(0);
    expect(summary.tables.reserve).toBe(json(files, 'reserve').length);
    expect(
      json(files, 'membres')
        .map((m) => m.email)
        .sort(),
    ).toEqual(['alice@a.fr', 'carole@exemple.fr', 'david@a.fr']);
    // Ni mot de passe ni empreinte de jeton.
    expect(Object.keys(json(files, 'membres')[0]!)).not.toContain('password');
    expect(Object.keys(json(files, 'assignment')[0]!)).not.toContain('token_hash');

    const stored = await ctx.storage.list(organisationPrefix(orgA));
    const exported = Object.keys(files).filter((name) => name.startsWith('fichiers/'));
    expect(exported).toHaveLength(stored.length);
    expect(exported.some((name) => name.includes('/proofs/'))).toBe(true);
    expect(Object.keys(files).filter((name) => name.startsWith('dossiers-de-preuves/'))).toEqual([
      'dossiers-de-preuves/Entrepôt de Villefranche.pdf',
      'dossiers-de-preuves/Usine de Lyon.pdf',
    ]);
    expect(strFromU8(files['LISEZMOI.txt']!)).toContain('Organisation : Usine A');
    expect(JSON.stringify(json(files, 'reserve'))).not.toContain(orgB);
  });

  it('écrit un CSV lisible dans Excel', async () => {
    const { files } = await exportArchive(orgA);
    const bytes = files['csv/site.csv']!;
    // Marque d'ordre des octets UTF-8 (TextDecoder la retire au décodage).
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = strFromU8(bytes);
    expect(csv.startsWith('id;organisation_id;name;')).toBe(true);
    expect(csv).toContain('Usine de Lyon');
  });
});

describe("suppression d'une organisation", () => {
  it('toute table métier est exportée et supprimée', async () => {
    const { rows } = await ctx.db.execute<{ table: string }>(sql`
      select c.relname as table
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id'
      where c.relkind = 'r' and c.relname not in ('member', 'invitation')
    `);
    expect(ORGANISATION_TABLES.map(({ table }) => getTableName(table)).sort()).toEqual(
      rows.map((row) => row.table).sort(),
    );
  });

  it('la simulation décrit la suppression sans rien supprimer', async () => {
    const plan = await planOrganisationDeletion({ db: owner.db, storage: ctx.storage }, orgA);
    expect(plan.organisation?.name).toBe('Usine A');
    expect(plan.tables.reserve).toBeGreaterThan(0);
    expect(plan.tables.member).toBe(3);
    expect(plan.usersToDelete).toEqual(['alice@a.fr', 'david@a.fr']);
    expect(plan.usersToKeep).toEqual(['carole@exemple.fr']);
    expect(plan.files).toBeGreaterThan(0);

    const again = await planOrganisationDeletion({ db: owner.db, storage: ctx.storage }, orgA);
    expect(again).toEqual(plan);
  });

  it("supprime ses données, ses fichiers et ses comptes, sans toucher à l'autre", async () => {
    const deps = { db: owner.db, storage: ctx.storage };
    const before = await planOrganisationDeletion(deps, orgA);
    const otherBefore = await planOrganisationDeletion(deps, orgB);

    const result = await deleteOrganisation({ ...deps, queue: ctx.queue }, orgA);
    expect(result.tables).toEqual(before.tables);
    expect(result.files).toBe(before.files);
    expect(result.usersDeleted).toEqual(['alice@a.fr', 'david@a.fr']);
    expect(result.usersKept).toEqual([]);

    const after = await planOrganisationDeletion(deps, orgA);
    expect(after).toMatchObject({ organisation: null, files: 0 });
    for (const { table } of ORGANISATION_TABLES) {
      const rows = await withOrganisation(owner.db, orgA, (tx) => tx.select().from(table));
      expect(rows).toEqual([]);
    }
    // Carole n'est plus partagée : seuls les données et les fichiers de B sont comparés.
    const otherAfter = await planOrganisationDeletion(deps, orgB);
    expect({ tables: otherAfter.tables, files: otherAfter.files }).toEqual({
      tables: otherBefore.tables,
      files: otherBefore.files,
    });

    const emails = await owner.db.select({ email: user.email }).from(user);
    expect(emails.map((u) => u.email)).not.toContain('alice@a.fr');
    expect(emails.map((u) => u.email)).not.toContain('david@a.fr');
    const carole = await owner.db
      .select({ organisationId: member.organisationId })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(user.email, 'carole@exemple.fr'));
    expect(carole).toEqual([{ organisationId: orgB }]);
  });

  it("conserve un compte encore cité par les données d'une autre organisation", async () => {
    const [david] = await owner.db.select().from(user).where(eq(user.email, 'david@a.fr'));
    await withOrganisation(owner.db, orgB, async (tx) => {
      const [first] = await tx.select({ id: reserve.id }).from(reserve).limit(1);
      await tx.insert(reserveEvent).values({
        organisationId: orgB,
        reserveId: first!.id,
        type: 'commentaire',
        actorUserId: david!.id,
      });
    });

    const result = await deleteOrganisation(
      { db: owner.db, storage: ctx.storage, queue: ctx.queue },
      orgA,
    );
    expect(result.usersDeleted).toEqual(['alice@a.fr']);
    expect(result.usersKept).toEqual(['david@a.fr']);
    const remaining = await owner.db
      .select({ email: user.email })
      .from(user)
      .where(inArray(user.email, ['alice@a.fr', 'david@a.fr']));
    expect(remaining).toEqual([{ email: 'david@a.fr' }]);
  });

  it("refuse pendant l'analyse d'un rapport, sans rien supprimer", async () => {
    const [running] = await withOrganisation(ctx.db, orgA, (tx) =>
      tx.select({ id: reportImport.id }).from(reportImport).limit(1),
    );
    ctx.queue.running.add(running!.id);
    try {
      await expect(
        deleteOrganisation({ db: owner.db, storage: ctx.storage, queue: ctx.queue }, orgA),
      ).rejects.toThrow(DeletionError);
    } finally {
      ctx.queue.running.clear();
    }
    const plan = await planOrganisationDeletion({ db: owner.db, storage: ctx.storage }, orgA);
    expect(plan.organisation).not.toBeNull();
    expect(plan.files).toBeGreaterThan(0);
  });

  it('une relance supprime les fichiers restés après une suppression interrompue', async () => {
    const gone = crypto.randomUUID();
    await ctx.storage.put(`${organisationPrefix(gone)}reste.txt`, 'reste', 'text/plain');
    const plan = await planOrganisationDeletion({ db: owner.db, storage: ctx.storage }, gone);
    expect(plan).toMatchObject({ organisation: null, files: 1 });

    const result = await deleteOrganisation(
      { db: owner.db, storage: ctx.storage, queue: ctx.queue },
      gone,
    );
    expect(result.files).toBe(1);
    expect(await ctx.storage.list(organisationPrefix(gone))).toEqual([]);
  });
});
