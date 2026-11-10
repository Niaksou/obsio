import { once } from 'node:events';
import type { Writable } from 'node:stream';
import { organisationPrefix } from '@obsio/shared';
import { eq, getTableColumns, getTableName, type Table } from 'drizzle-orm';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { withOrganisation, type Database } from '../db/client.js';
import { invitation, member, site, user } from '../db/schema/index.js';
import { buildProofDossier } from '../reserves/dossier.js';
import type { Storage } from '../storage.js';
import { ORGANISATION_TABLES } from './data.js';

// Export des données d'une organisation à sa demande (spec, « RGPD ») : une archive ZIP lisible
// sans Obsio, avec chaque table en CSV et en JSON, les fichiers d'origine et un dossier de
// preuves par site.

type Row = Record<string, unknown>;

export interface ExportSummary {
  /** Lignes exportées par table. */
  tables: Record<string, number>;
  files: number;
  bytes: number;
  dossiers: number;
}

/** Marque d'ordre des octets : Excel lit alors le CSV en UTF-8 (accents). */
const BOM = '\uFEFF';

/** Fichiers déjà compressés : stockés tels quels dans l'archive. */
const COMPRESSED = /\.(pdf|png|jpe?g|webp|heic|gif|zip)$/i;

/** Valeur d'une cellule : point-virgule pour Excel en français, formules neutralisées. */
function cell(value: unknown): string {
  let text: string;
  if (value === null || value === undefined) text = '';
  else if (value instanceof Date) text = value.toISOString();
  else if (Array.isArray(value)) text = value.map((v) => cell(v)).join(' | ');
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  // Un texte venu d'un rapport qui commence par « = » serait exécuté comme une formule.
  if (/^[=+@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(columns: string[], rows: Row[]): string {
  const lines = [columns, ...rows.map((row) => columns.map((column) => row[column]))];
  return `${BOM}${lines.map((line) => line.map((value) => cell(value)).join(';')).join('\r\n')}\r\n`;
}

/** Nom de fichier sans caractère interdit sous Windows ou macOS. */
function safeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]+/g, '-').trim() || 'sans-nom';
}

/** Lignes d'une table Drizzle, avec les noms de colonnes de la base (snake_case). */
function withColumnNames(table: Table, rows: Row[], omit: readonly string[] = []) {
  const columns = Object.entries(getTableColumns(table))
    .map(([key, column]) => ({ key, name: column.name }))
    .filter((column) => !omit.includes(column.name));
  return {
    columns: columns.map((column) => column.name),
    rows: rows.map((row) => Object.fromEntries(columns.map((c) => [c.name, row[c.key]]))),
  };
}

function readme(organisationName: string, summary: ExportSummary): string {
  const tables = Object.entries(summary.tables)
    .map(([name, count]) => `  ${name.padEnd(20)} ${count}`)
    .join('\n');
  return `Export des données Obsio
Organisation : ${organisationName}
Établi le : ${new Date().toISOString()}

Contenu
- csv/ : une table par fichier, séparateur point-virgule, encodage UTF-8 (s'ouvre dans Excel).
  Les listes sont séparées par « | » ; les textes commençant par = + ou @ sont précédés d'une
  apostrophe pour ne pas être lus comme des formules.
- json/ : les mêmes données, sans transformation, pour un import dans un autre outil.
- fichiers/ : les fichiers déposés dans Obsio, rangés comme dans l'application :
  imports/<import>/rapport.pdf (rapport d'origine), ocr.json et extraction.json (lecture
  automatique du rapport), floors/<étage>/plans/ (plans), reserves/<réserve>/proofs/ (photos).
- dossiers-de-preuves/ : le dossier de preuves de chaque site, toutes réserves comprises.

Tables
- organisation, membres, invitations : le compte et ses utilisateurs (sans mot de passe).
- site, building, floor, equipment : sites, bâtiments, étages, équipements placés sur les plans.
- inspection_plan : échéancier des vérifications par site.
- report_import, report_document : rapports importés et documents qu'ils contiennent.
- draft_reserve : réserves extraites, telles que proposées avant validation.
- reserve, reserve_source : réserves validées et documents qui les signalent.
- contractor, assignment, assignment_reserve : intervenants et assignations.
- proof : preuves de correction (commentaire et chemins des photos dans fichiers/).
- reserve_event : journal d'audit de chaque réserve.
Les colonnes *_id renvoient à la colonne id de la table correspondante.

Lignes par table
${tables}

Fichiers : ${summary.files} (${summary.bytes} octets)
Dossiers de preuves : ${summary.dossiers}
`;
}

/** Écrit l'archive de l'organisation dans output, sans la garder entière en mémoire. */
export async function exportOrganisation(
  deps: { db: Database; storage: Storage },
  organisation: { id: string; name: string; slug: string; siret: string | null; createdAt: Date },
  output: Writable,
): Promise<ExportSummary> {
  const { db, storage } = deps;
  const summary: ExportSummary = { tables: {}, files: 0, bytes: 0, dossiers: 0 };

  let failure: Error | null = null;
  let finished!: () => void;
  const done = new Promise<void>((resolve) => (finished = resolve));
  const zip = new Zip((error, chunk, final) => {
    if (error) failure = error;
    else output.write(chunk);
    if (error || final) finished();
  });

  async function add(name: string, content: Buffer | string) {
    const data = typeof content === 'string' ? Buffer.from(content) : content;
    const file = COMPRESSED.test(name) ? new ZipPassThrough(name) : new ZipDeflate(name);
    zip.add(file);
    file.push(data, true);
    if (failure) throw failure;
    if (output.writableNeedDrain) await once(output, 'drain');
  }

  async function addTable(name: string, columns: string[], rows: Row[]) {
    summary.tables[name] = rows.length;
    await add(`csv/${name}.csv`, toCsv(columns, rows));
    await add(`json/${name}.json`, JSON.stringify(rows, null, 2));
  }

  await addTable(
    'organisation',
    ['id', 'name', 'slug', 'siret', 'created_at'],
    [
      {
        id: organisation.id,
        name: organisation.name,
        slug: organisation.slug,
        siret: organisation.siret,
        created_at: organisation.createdAt,
      },
    ],
  );
  // Tables de Better Auth, sans RLS : filtrées explicitement sur l'organisation.
  const members = await db
    .select({
      user_id: user.id,
      name: user.name,
      first_name: user.firstName,
      last_name: user.lastName,
      email: user.email,
      role: member.role,
      created_at: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organisationId, organisation.id));
  await addTable('membres', ['user_id', 'name', 'email', 'role', 'created_at'], members);
  const invitations = await db
    .select({
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expires_at: invitation.expiresAt,
      created_at: invitation.createdAt,
    })
    .from(invitation)
    .where(eq(invitation.organisationId, organisation.id));
  await addTable(
    'invitations',
    ['email', 'role', 'status', 'expires_at', 'created_at'],
    invitations,
  );

  await withOrganisation(db, organisation.id, async (tx) => {
    for (const entry of ORGANISATION_TABLES) {
      const omit = 'omit' in entry ? entry.omit : [];
      const table = withColumnNames(entry.table, await tx.select().from(entry.table), omit);
      await addTable(getTableName(entry.table), table.columns, table.rows);
    }

    const sites = await tx.select().from(site).orderBy(site.name);
    const names = new Set<string>();
    for (const s of sites) {
      const pdf = await buildProofDossier(tx, storage, {
        organisationName: organisation.name,
        site: { id: s.id, name: s.name, address: s.address },
        scope: 'toutes',
      });
      let name = safeName(s.name);
      if (names.has(name)) name = `${name} (${s.id})`;
      names.add(name);
      await add(`dossiers-de-preuves/${name}.pdf`, pdf);
      summary.dossiers += 1;
    }
  });

  const prefix = organisationPrefix(organisation.id);
  for (const object of await storage.list(prefix)) {
    const content = await storage.get(object.key);
    if (!content) continue;
    await add(`fichiers/${object.key.slice(prefix.length)}`, content);
    summary.files += 1;
    summary.bytes += content.length;
  }

  await add('LISEZMOI.txt', readme(organisation.name, summary));
  zip.end();
  await done;
  if (failure) throw failure;
  return summary;
}
