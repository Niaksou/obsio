import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, withOrganisation } from '../src/db/client.js';
import { building, equipment, floor, site } from '../src/db/schema/index.js';
import { createOrganisation, resetDatabase, testConfig } from './helpers.js';

const { pool, db } = createDatabase(testConfig().DATABASE_URL);

afterAll(() => pool.end());

describe('Row Level Security', () => {
  let orgA: string;
  let orgB: string;
  let siteB: string;

  beforeEach(async () => {
    await resetDatabase();
    orgA = (await createOrganisation(db, 'A')).id;
    orgB = (await createOrganisation(db, 'B')).id;
    await withOrganisation(db, orgA, (tx) =>
      tx.insert(site).values({ organisationId: orgA, name: 'Usine A' }),
    );
    const [created] = await withOrganisation(db, orgB, (tx) =>
      tx.insert(site).values({ organisationId: orgB, name: 'Usine B' }).returning(),
    );
    siteB = created!.id;
  });

  it('une organisation ne voit que ses propres sites', async () => {
    const sites = await withOrganisation(db, orgA, (tx) => tx.select().from(site));
    expect(sites.map((s) => s.name)).toEqual(['Usine A']);
  });

  it("sans organisation posée, aucune ligne n'est visible", async () => {
    expect(await db.select().from(site)).toEqual([]);
    // Même après une transaction qui a posé le paramètre sur la connexion.
    await withOrganisation(db, orgA, (tx) => tx.select().from(site));
    expect(await db.select().from(site)).toEqual([]);
  });

  it("une organisation ne peut pas modifier ni supprimer les sites d'une autre", async () => {
    const updated = await withOrganisation(db, orgA, (tx) =>
      tx.update(site).set({ name: 'Piraté' }).where(eq(site.id, siteB)).returning(),
    );
    const deleted = await withOrganisation(db, orgA, (tx) =>
      tx.delete(site).where(eq(site.id, siteB)).returning(),
    );
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);

    const [unchanged] = await withOrganisation(db, orgB, (tx) =>
      tx.select().from(site).where(eq(site.id, siteB)),
    );
    expect(unchanged?.name).toBe('Usine B');
  });

  it("une organisation ne peut pas créer de site au nom d'une autre", async () => {
    await expect(
      withOrganisation(db, orgA, (tx) =>
        tx.insert(site).values({ organisationId: orgB, name: 'Intrus' }),
      ),
    ).rejects.toThrow();
  });

  it('une organisation ne peut pas transférer un site vers une autre', async () => {
    await expect(
      withOrganisation(db, orgB, (tx) =>
        tx.update(site).set({ organisationId: orgA }).where(eq(site.id, siteB)),
      ),
    ).rejects.toThrow();
  });
});

describe('Row Level Security des bâtiments, étages et équipements', () => {
  let orgA: string;
  let orgB: string;
  let siteA: string;
  let siteB: string;

  /** Crée un site, un bâtiment, un étage et un équipement pour une organisation. */
  async function seed(org: string, label: string) {
    return withOrganisation(db, org, async (tx) => {
      const [s] = await tx
        .insert(site)
        .values({ organisationId: org, name: `Site ${label}` })
        .returning();
      const [b] = await tx
        .insert(building)
        .values({ organisationId: org, siteId: s!.id, name: `Bâtiment ${label}` })
        .returning();
      const [f] = await tx
        .insert(floor)
        .values({ organisationId: org, buildingId: b!.id, name: `RDC ${label}` })
        .returning();
      await tx.insert(equipment).values({
        organisationId: org,
        floorId: f!.id,
        type: 'td',
        name: `TD ${label}`,
        x: 0.5,
        y: 0.5,
      });
      return { siteId: s!.id, buildingId: b!.id, floorId: f!.id };
    });
  }

  beforeEach(async () => {
    await resetDatabase();
    orgA = (await createOrganisation(db, 'A')).id;
    orgB = (await createOrganisation(db, 'B')).id;
    siteA = (await seed(orgA, 'A')).siteId;
    siteB = (await seed(orgB, 'B')).siteId;
  });

  it('une organisation ne voit que ses propres bâtiments, étages et équipements', async () => {
    const [buildings, floors, equipments] = await withOrganisation(db, orgA, (tx) =>
      Promise.all([
        tx.select().from(building),
        tx.select().from(floor),
        tx.select().from(equipment),
      ]),
    );
    expect(buildings.map((b) => b.name)).toEqual(['Bâtiment A']);
    expect(floors.map((f) => f.name)).toEqual(['RDC A']);
    expect(equipments.map((e) => e.name)).toEqual(['TD A']);
  });

  it("on ne peut pas rattacher un bâtiment au site d'une autre organisation", async () => {
    // La clé étrangère contourne la RLS : c'est la paire (site_id, organisation_id) qui bloque.
    await expect(
      withOrganisation(db, orgA, (tx) =>
        tx.insert(building).values({ organisationId: orgA, siteId: siteB, name: 'Intrus' }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganisation(db, orgA, (tx) =>
        tx.insert(building).values({ organisationId: orgA, siteId: siteA, name: 'Légitime' }),
      ),
    ).resolves.toBeDefined();
  });

  it("on ne peut pas rattacher un étage ou un équipement au parent d'une autre organisation", async () => {
    const [b] = await withOrganisation(db, orgB, (tx) => tx.select().from(building));
    const [f] = await withOrganisation(db, orgB, (tx) => tx.select().from(floor));
    await expect(
      withOrganisation(db, orgA, (tx) =>
        tx.insert(floor).values({ organisationId: orgA, buildingId: b!.id, name: 'Intrus' }),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganisation(db, orgA, (tx) =>
        tx
          .insert(equipment)
          .values({ organisationId: orgA, floorId: f!.id, type: 'td', name: 'Intrus' }),
      ),
    ).rejects.toThrow();
  });

  it('refuse une position hors du plan ou à moitié renseignée', async () => {
    const [f] = await withOrganisation(db, orgA, (tx) => tx.select().from(floor));
    const insert = (x: number | null, y: number | null) =>
      withOrganisation(db, orgA, (tx) =>
        tx.insert(equipment).values({
          organisationId: orgA,
          floorId: f!.id,
          type: 'machine',
          name: 'Presse 3',
          x,
          y,
        }),
      );
    await expect(insert(1.2, 0.5)).rejects.toThrow();
    await expect(insert(0.5, null)).rejects.toThrow();
    await expect(insert(null, null)).resolves.toBeDefined();
  });
});

// Tables internes de Better Auth : il les interroge sans organisation posée (par exemple pour
// lister les organisations d'un utilisateur). L'application n'y accède que via Better Auth et
// findMembership. Toute autre table portant organisation_id doit être protégée par la RLS.
const AUTH_TABLES = ['member', 'invitation'];

describe('Garde-fous de la base', () => {
  it("le rôle de l'application ne contourne pas la RLS", async () => {
    const { rows } = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('toute table portant organisation_id a une RLS active, forcée et une politique', async () => {
    const { rows } = await db.execute<{
      table: string;
      rls: boolean;
      forced: boolean;
      policies: number;
    }>(sql`
      select c.relname as table,
             c.relrowsecurity as rls,
             c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id'
      where c.relkind = 'r'
    `);
    const businessTables = rows.filter((row) => !AUTH_TABLES.includes(row.table));
    expect(businessTables.length).toBeGreaterThan(0);
    const unprotected = businessTables.filter(
      (row) => !row.rls || !row.forced || row.policies === 0,
    );
    expect(unprotected).toEqual([]);
  });
});
