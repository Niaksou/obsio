import {
  defaultLicence,
  PAGE_PATTERNS,
  parisDate,
  type ExtractedReserve,
  type Licence,
} from '@obsio/shared';
import { like } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { shiftDay } from '../console/usage.js';
import { withOrganisation, type Database } from '../db/client.js';
import {
  draftReserve,
  invitation,
  member,
  organisation,
  pageView,
  reportDocument,
  reportImport,
  session,
  site,
  user,
} from '../db/schema/index.js';
import { saveLicence } from '../licences/licence.js';
import { DemoError } from './seed.js';

// Clients fictifs pour voir la console Obsio remplie (pnpm demo:console) : licences dans tous
// les états, analyses et pages vues sur 90 jours, connexions anciennes ou absentes.
// Seuls les chiffres lus par la console existent : ni PDF, ni plan, ni réserve active. Les
// comptes n'ont pas de mot de passe et leurs sessions sont expirées : personne ne s'y connecte.

/** Suffixe des noms : repère les clients fictifs (et `pnpm org:delete` les retire un par un). */
export const DEMO_SUFFIX = ' (démo)';

const DAY = 86_400_000;

interface DemoClient {
  name: string;
  /** Ancienneté du client, en jours. */
  age: number;
  licence: (today: string) => Licence;
  members: string[];
  sites: string[];
  /** Analyses par jour en moyenne sur 90 jours ; `thisMonth` en force un nombre ce mois-ci. */
  analysesPerDay: number;
  thisMonth?: number;
  failureRate: number;
  /** Pages vues par jour en moyenne quand le client est actif. */
  viewsPerDay: number;
  /** Jours depuis la dernière connexion ; null : personne ne s'est jamais connecté. */
  lastLogin: number | null;
  pendingInvitations?: number;
}

const standard = (start: string): Licence => ({ ...defaultLicence(start) });

export const DEMO_CLIENTS: DemoClient[] = [
  {
    name: 'Fonderie Marchal',
    age: 300,
    licence: (today) => standard(shiftDay(today, -300)),
    members: ['Hélène Marchal', 'Yanis Ferrand', 'Sophie Lebrun', 'Marc Dupuis'],
    sites: ['Usine de Saint-Étienne', 'Entrepôt de Firminy', 'Atelier de Roanne'],
    analysesPerDay: 0.6,
    failureRate: 0.05,
    viewsPerDay: 60,
    lastLogin: 0,
  },
  {
    name: 'Laiterie des Combes',
    age: 210,
    licence: (today) => standard(shiftDay(today, -210)),
    members: ['Claire Vidal', 'Thomas Rey'],
    sites: ['Laiterie de Pontarlier', 'Fromagerie de Morteau'],
    analysesPerDay: 0.3,
    failureRate: 0.1,
    viewsPerDay: 25,
    lastLogin: 1,
  },
  {
    name: 'Clinique du Parc',
    age: 22,
    licence: (today) => ({
      ...defaultLicence(shiftDay(today, -22)),
      plan: 'essai',
      endsOn: shiftDay(today, 8),
      maxSites: 2,
      maxMembers: 5,
      maxAnalysesPerMonth: 10,
      note: 'Essai d’un mois, rappeler avant la fin',
    }),
    members: ['Nadia Benali', 'Julien Morel'],
    sites: ['Bâtiment principal'],
    analysesPerDay: 0.2,
    failureRate: 0,
    viewsPerDay: 18,
    lastLogin: 2,
    pendingInvitations: 1,
  },
  {
    name: 'Imprimerie Garnier',
    age: 400,
    licence: (today) => ({
      ...defaultLicence(shiftDay(today, -400)),
      plan: 'sur_mesure',
      endsOn: shiftDay(today, 160),
      maxSites: 6,
      maxMembers: 12,
      maxAnalysesPerMonth: 20,
      note: 'Contrat annuel, 20 analyses par mois',
    }),
    members: ['Paul Garnier', 'Inès Caron', 'Hugo Lambert', 'Léa Roussel', 'Karim Haddad'],
    sites: ['Imprimerie de Nantes', 'Dépôt de Rezé', 'Atelier de Saint-Herblain', 'Siège'],
    analysesPerDay: 0.5,
    thisMonth: 18,
    failureRate: 0.08,
    viewsPerDay: 80,
    lastLogin: 0,
  },
  {
    name: 'Menuiserie Aubert',
    age: 380,
    licence: (today) => ({
      ...defaultLicence(shiftDay(today, -380)),
      status: 'suspendue',
      note: 'Facture impayée depuis septembre',
    }),
    members: ['Éric Aubert'],
    sites: ['Atelier de Cholet'],
    analysesPerDay: 0.05,
    failureRate: 0,
    viewsPerDay: 4,
    lastLogin: 12,
  },
  {
    name: 'Plasturgie Ventoux',
    age: 500,
    licence: (today) => ({
      ...defaultLicence(shiftDay(today, -500)),
      status: 'revoquee',
      note: 'Contrat résilié à la demande du client',
    }),
    members: ['Rémi Chabert', 'Anne Fabre'],
    sites: ['Usine de Carpentras'],
    analysesPerDay: 0,
    failureRate: 0,
    viewsPerDay: 0,
    lastLogin: 75,
  },
  {
    name: 'Hôtel Belvédère',
    age: 180,
    licence: (today) => standard(shiftDay(today, -180)),
    members: ['Marion Giraud', 'Antoine Leroy'],
    sites: ['Hôtel', 'Restaurant'],
    analysesPerDay: 0.1,
    failureRate: 0.2,
    viewsPerDay: 6,
    lastLogin: 41,
  },
  {
    name: 'Cartonnerie Lemoine',
    age: 20,
    licence: (today) => standard(shiftDay(today, -20)),
    members: [],
    sites: [],
    analysesPerDay: 0,
    failureRate: 0,
    viewsPerDay: 0,
    lastLogin: null,
    pendingInvitations: 1,
  },
];

/** Tirage pseudo-aléatoire reproductible (mêmes chiffres à chaque exécution). */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

/** Nombre entier tiré autour de `mean` (Poisson approché pour les petites moyennes). */
function draw(next: () => number, mean: number) {
  if (mean <= 0) return 0;
  const whole = Math.floor(mean);
  return whole + (next() < mean - whole ? 1 : 0);
}

const slugOf = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const MODELS = [
  { model: 'mistral-medium-2508', prompt: 'v3', until: 40 },
  { model: 'mistral-medium-2511', prompt: 'v4', until: 0 },
];

const DRAFT_TEXTS = [
  ['Absence de capot sur le TGBT', 'Absence de capot de protection sur le TGBT'],
  ['Prise de courant cassée', 'Prise de courant cassée au poste 3'],
  ['Défaut de continuité de terre', 'Défaut de continuité du conducteur de protection'],
  ['Repérage des circuits absent', 'Repérage des circuits absent dans le coffret C2'],
  ['Boîte de dérivation sans couvercle', 'Boîte de dérivation sans couvercle'],
] as const;

export interface ConsoleDemoSummary {
  clients: number;
  analyses: number;
  pageViews: number;
}

/**
 * Crée les clients fictifs. Refuse si l'un d'eux existe déjà : retirer d'abord les précédents
 * avec `pnpm org:delete`.
 */
export async function seedConsoleDemo(db: Database, now = new Date()): Promise<ConsoleDemoSummary> {
  const existing = await db
    .select({ name: organisation.name })
    .from(organisation)
    .where(like(organisation.name, `%${DEMO_SUFFIX}`));
  if (existing.length > 0) {
    throw new DemoError(
      `Des clients fictifs existent déjà (${existing.map((o) => o.name).join(', ')}).`,
    );
  }

  const today = parisDate(now);
  const startOfMonth = `${today.slice(0, 8)}01`;
  const next = random(2026);
  const summary: ConsoleDemoSummary = { clients: 0, analyses: 0, pageViews: 0 };
  const at = (days: number, hour = 10) =>
    new Date(Date.parse(`${shiftDay(today, -days)}T${String(hour).padStart(2, '0')}:00:00Z`));

  for (const client of DEMO_CLIENTS) {
    const slug = slugOf(client.name);
    const [org] = await db
      .insert(organisation)
      .values({
        name: `${client.name}${DEMO_SUFFIX}`,
        slug: `demo-${slug}-${randomUUID().slice(0, 8)}`,
        createdAt: at(client.age, 9),
      })
      .returning();
    const organisationId = org!.id;

    // Comptes sans mot de passe ni double authentification : ils ne servent qu'aux chiffres.
    const users: (typeof user.$inferSelect)[] = [];
    for (const [index, name] of client.members.entries()) {
      const [first, ...rest] = name.split(' ');
      const local = slugOf(name).replace(/-/g, '.');
      const [created] = await db
        .insert(user)
        .values({
          name,
          firstName: first,
          lastName: rest.join(' '),
          email: `${local}@${slug}.invalid`,
          emailVerified: true,
          createdAt: at(client.age - index, 9),
        })
        .returning();
      users.push(created!);
      await db.insert(member).values({
        organisationId,
        userId: created!.id,
        role: index === 0 ? 'admin' : 'membre',
        createdAt: at(client.age - index, 9),
      });
    }
    // Dernière connexion : une session déjà expirée, au jeton inutilisable.
    if (client.lastLogin !== null && users[0]) {
      await db.insert(session).values({
        userId: users[0].id,
        token: randomBytes(32).toString('base64url'),
        expiresAt: new Date(now.getTime() - DAY),
        createdAt: at(client.lastLogin, 8),
        updatedAt: at(client.lastLogin, 8),
      });
    }

    await withOrganisation(db, organisationId, async (tx) => {
      await saveLicence(tx, organisationId, client.licence(today));

      for (let i = 0; i < (client.pendingInvitations ?? 0); i++) {
        // Sans membre, l'invitation est attribuée à un compte existant quelconque.
        const [inviter] = users[0]
          ? [users[0]]
          : await tx.select({ id: user.id }).from(user).limit(1);
        if (!inviter) break;
        await tx.insert(invitation).values({
          organisationId,
          email: `responsable${i + 1}@${slug}.invalid`,
          role: client.members.length === 0 ? 'admin' : 'membre',
          status: 'pending',
          expiresAt: new Date(now.getTime() + 5 * DAY),
          inviterId: inviter.id,
        });
      }

      const sites: (typeof site.$inferSelect)[] = [];
      for (const name of client.sites) {
        const [created] = await tx
          .insert(site)
          .values({ organisationId, name, createdAt: at(client.age - 1) })
          .returning();
        sites.push(created!);
      }
      const author = users[0];
      if (!author || sites.length === 0) return;

      // Analyses des 90 derniers jours, plus celles imposées ce mois-ci.
      const days: number[] = [];
      const horizon = Math.min(90, client.age - 1);
      for (let ago = horizon; ago >= 0; ago--) {
        for (let n = draw(next, client.analysesPerDay); n > 0; n--) days.push(ago);
      }
      if (client.thisMonth !== undefined) {
        const monthDays = Math.round((Date.parse(today) - Date.parse(startOfMonth)) / DAY);
        const inMonth = days.filter((ago) => shiftDay(today, -ago) >= startOfMonth).length;
        for (let n = inMonth; n < client.thisMonth; n++) {
          days.push(Math.floor(next() * (monthDays + 1)));
        }
      }

      for (const [index, ago] of days.entries()) {
        const failed = next() < client.failureRate;
        const version = MODELS.find((m) => ago >= m.until)!;
        const pages = 8 + Math.floor(next() * 50);
        const siteRow = sites[index % sites.length]!;
        const createdAt = at(ago, 8 + Math.floor(next() * 9));
        const [created] = await tx
          .insert(reportImport)
          .values({
            organisationId,
            siteId: siteRow.id,
            fileName: `rapport-${shiftDay(today, -ago)}.pdf`,
            pdfKey: `demo/${organisationId}/${randomUUID()}.pdf`,
            status: failed ? 'erreur' : ago < 2 && index % 2 === 0 ? 'a_valider' : 'valide',
            error: failed ? 'Rapport illisible (démonstration)' : null,
            trace: failed
              ? null
              : {
                  provider: 'mistral',
                  ocrModel: 'mistral-ocr-2505',
                  extractionModel: version.model,
                  promptVersion: version.prompt,
                  attempts: next() < 0.1 ? 2 : 1,
                  rawOutput: '{}',
                  usage: {
                    ocrPages: pages,
                    promptTokens: pages * (2_500 + Math.floor(next() * 1_500)),
                    completionTokens: pages * (300 + Math.floor(next() * 400)),
                  },
                },
            createdBy: author.id,
            createdAt,
            updatedAt: createdAt,
          })
          .returning();
        summary.analyses++;
        if (failed) continue;

        const [document] = await tx
          .insert(reportDocument)
          .values({
            organisationId,
            importId: created!.id,
            siteId: siteRow.id,
            position: 0,
            type: 'periodique',
            organisme: 'Bureau de contrôle (démo)',
          })
          .returning();
        // Brouillons tranchés : le prompt v4 garde davantage de points tels quels.
        const keptRate = version.prompt === 'v4' ? 0.75 : 0.55;
        const pending = created!.status === 'a_valider';
        const drafts = DRAFT_TEXTS.slice(0, 2 + Math.floor(next() * 4)).map(
          ([text, corrected], position) => {
            const roll = next();
            const kept = roll < keptRate;
            const rejected = !kept && roll > 0.9;
            return {
              organisationId,
              importId: created!.id,
              documentId: document!.id,
              position,
              extracted: { reference: String(position + 1), description: text } as ExtractedReserve,
              description: kept || rejected ? text : corrected,
              decision: pending
                ? ('a_valider' as const)
                : rejected
                  ? ('ecartee' as const)
                  : ('retenue' as const),
            };
          },
        );
        await tx.insert(draftReserve).values(drafts);
      }

      // Pages vues, jours ouvrés surtout, jusqu'à la dernière connexion.
      const lastActive = client.lastLogin ?? Infinity;
      const views = [];
      for (let ago = Math.min(90, client.age - 1); ago >= lastActive; ago--) {
        const weekday = new Date(Date.parse(shiftDay(today, -ago))).getUTCDay();
        const factor = weekday === 0 || weekday === 6 ? 0.15 : 1;
        for (const path of PAGE_PATTERNS) {
          const weight = PAGE_WEIGHTS[path] ?? 0.02;
          const count = draw(next, client.viewsPerDay * factor * weight * (0.6 + next() * 0.8));
          if (count > 0) {
            views.push({ organisationId, day: shiftDay(today, -ago), path, views: count });
            summary.pageViews += count;
          }
        }
      }
      if (views.length > 0) await tx.insert(pageView).values(views);
    });
    summary.clients++;
  }
  return summary;
}

/** Part de chaque page dans les visites (le reste se partage les miettes). */
const PAGE_WEIGHTS: Partial<Record<(typeof PAGE_PATTERNS)[number], number>> = {
  '/': 0.22,
  '/sites/:id': 0.16,
  '/sites/:id/reserves': 0.14,
  '/reserves/:id': 0.15,
  '/etages/:id': 0.12,
  '/mes-reserves': 0.08,
  '/imports/:id': 0.05,
  '/verifications': 0.04,
  '/batiments/:id/3d': 0.02,
};
