import { parisDate, type ConsoleUsage, type PagePattern } from '@obsio/shared';
import { and, asc, eq, gte, ne, sql } from 'drizzle-orm';
import type { ApiConfig } from '../config.js';
import { withOrganisation, type Database, type Transaction } from '../db/client.js';
import { draftReserve, organisation, pageView, reportImport } from '../db/schema/index.js';

// Usage pour la console : consommation de l'extraction (Mistral), qualité des brouillons et pages
// vues. Lu organisation par organisation, sous la RLS, par agrégats seulement.

type Consumption = Omit<ConsoleUsage['days'][number], 'day' | 'pageViews'>;

const empty = (): Consumption => ({
  analyses: 0,
  failures: 0,
  ocrPages: 0,
  promptTokens: 0,
  completionTokens: 0,
  cost: 0,
});

function add(target: Consumption, value: Omit<Consumption, 'cost'>) {
  target.analyses += value.analyses;
  target.failures += value.failures;
  target.ocrPages += value.ocrPages;
  target.promptTokens += value.promptTokens;
  target.completionTokens += value.completionTokens;
}

function shiftDay(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const usageField = (field: string) =>
  sql<number>`coalesce(sum((${reportImport.trace} -> 'usage' ->> ${field})::int), 0)::int`;

/** Analyses par jour (heure de Paris) depuis `from`. */
function importsByDay(tx: Transaction, from: string) {
  const day = sql<string>`to_char((${reportImport.createdAt} at time zone 'Europe/Paris')::date, 'YYYY-MM-DD')`;
  return tx
    .select({
      day,
      analyses: sql<number>`count(*)::int`,
      failures: sql<number>`(count(*) filter (where ${reportImport.status} = 'erreur'))::int`,
      ocrPages: usageField('ocrPages'),
      promptTokens: usageField('promptTokens'),
      completionTokens: usageField('completionTokens'),
    })
    .from(reportImport)
    .where(gte(reportImport.createdAt, sql`(${from}::date)::timestamp at time zone 'Europe/Paris'`))
    .groupBy(day);
}

/**
 * Brouillons extraits déjà tranchés : gardés tels quels, corrigés (constat ou préconisation
 * modifiés), ou écartés ; par modèle et version du prompt.
 */
function draftQuality(tx: Transaction, from: string) {
  const model = sql<string>`coalesce(${reportImport.trace} ->> 'extractionModel', 'inconnu')`;
  const prompt = sql<string>`coalesce(${reportImport.trace} ->> 'promptVersion', 'inconnue')`;
  const changed = sql`(${draftReserve.description} <> ${draftReserve.extracted} ->> 'description'
    or coalesce(${draftReserve.preconisation}, '') <> coalesce(${draftReserve.extracted} ->> 'preconisation', ''))`;
  return tx
    .select({
      model,
      promptVersion: prompt,
      kept: sql<number>`(count(*) filter (where ${draftReserve.decision} = 'retenue' and not ${changed}))::int`,
      edited: sql<number>`(count(*) filter (where ${draftReserve.decision} = 'retenue' and ${changed}))::int`,
      rejected: sql<number>`(count(*) filter (where ${draftReserve.decision} = 'ecartee'))::int`,
    })
    .from(draftReserve)
    .innerJoin(reportImport, eq(reportImport.id, draftReserve.importId))
    .where(
      and(
        eq(draftReserve.origin, 'extraction'),
        ne(draftReserve.decision, 'a_valider'),
        gte(reportImport.createdAt, sql`(${from}::date)::timestamp at time zone 'Europe/Paris'`),
      ),
    )
    .groupBy(model, prompt);
}

export async function consoleUsage(
  db: Database,
  config: ApiConfig,
  periodDays: number,
): Promise<ConsoleUsage> {
  const to = parisDate();
  const from = shiftDay(to, 1 - periodDays);
  const prices = {
    ocrPer1000Pages: config.PRICE_OCR_PER_1000_PAGES,
    inputPerMillionTokens: config.PRICE_INPUT_PER_MILLION_TOKENS,
    outputPerMillionTokens: config.PRICE_OUTPUT_PER_MILLION_TOKENS,
  };
  const cost = (c: Consumption) =>
    Math.round(
      ((c.ocrPages / 1000) * prices.ocrPer1000Pages +
        (c.promptTokens / 1e6) * prices.inputPerMillionTokens +
        (c.completionTokens / 1e6) * prices.outputPerMillionTokens) *
        100,
    ) / 100;

  const days = new Map<string, Consumption & { pageViews: number }>();
  for (let day = from; day <= to; day = shiftDay(day, 1)) {
    days.set(day, { ...empty(), pageViews: 0 });
  }
  const pages = new Map<string, number>();
  const quality = new Map<string, ConsoleUsage['quality'][number]>();
  const clients: ConsoleUsage['clients'] = [];

  const organisations = await db
    .select({ id: organisation.id, name: organisation.name })
    .from(organisation)
    .orderBy(asc(organisation.name));
  for (const org of organisations) {
    const figures = await withOrganisation(db, org.id, async (tx) => ({
      imports: await importsByDay(tx, from),
      views: await tx
        .select({ day: pageView.day, path: pageView.path, views: pageView.views })
        .from(pageView)
        .where(gte(pageView.day, from)),
      quality: await draftQuality(tx, from),
    }));

    const client = { id: org.id, name: org.name, pageViews: 0, ...empty() };
    for (const row of figures.imports) {
      add(client, row);
      const day = days.get(row.day);
      if (day) add(day, row);
    }
    for (const row of figures.views) {
      client.pageViews += row.views;
      const day = days.get(row.day);
      if (day) day.pageViews += row.views;
      pages.set(row.path, (pages.get(row.path) ?? 0) + row.views);
    }
    for (const row of figures.quality) {
      const key = `${row.model}\u0000${row.promptVersion}`;
      const total = quality.get(key) ?? { ...row, kept: 0, edited: 0, rejected: 0 };
      total.kept += row.kept;
      total.edited += row.edited;
      total.rejected += row.rejected;
      quality.set(key, total);
    }
    client.cost = cost(client);
    clients.push(client);
  }

  return {
    from,
    to,
    prices,
    days: [...days].map(([day, value]) => ({ day, ...value, cost: cost(value) })),
    clients: clients.sort((a, b) => b.cost - a.cost || b.pageViews - a.pageViews),
    quality: [...quality.values()].sort((a, b) =>
      `${b.model}${b.promptVersion}`.localeCompare(`${a.model}${a.promptVersion}`),
    ),
    pages: [...pages]
      .map(([path, views]) => ({ path: path as PagePattern, views }))
      .sort((a, b) => b.views - a.views),
  };
}
