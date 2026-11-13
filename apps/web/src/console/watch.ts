import type { ConsoleClient } from '@obsio/shared';

// « À surveiller » : les clients qui demandent une action de l'équipe, avec la raison.

export const WATCH_GROUPS = {
  licence: 'Licences à renouveler',
  silence: 'Clients sans connexion',
  plafond: 'Proches d’un plafond',
  echecs: 'Analyses en échec',
} as const;

/** Règle de chaque groupe, affichée sous son titre. */
export const WATCH_RULES: Record<keyof typeof WATCH_GROUPS, string> = {
  licence: 'Échéance sous 30 jours ou lecture seule',
  silence: '30 jours sans connexion, ou personne connecté 14 jours après l’ouverture',
  plafond: 'Plafond utilisé à 80 % ou plus',
  echecs: 'Depuis le début du mois',
};
export type WatchGroup = keyof typeof WATCH_GROUPS;

export interface WatchItem {
  group: WatchGroup;
  client: ConsoleClient;
  reason: string;
  /** Tri dans le groupe : le plus urgent d'abord. */
  rank: number;
}

const DAY = 86_400_000;
/** Échéance signalée à 30 jours, silence au-delà de 30 jours (14 pour un client jamais connecté). */
const SOON_DAYS = 30;
const SILENT_DAYS = 30;
const NEW_CLIENT_DAYS = 14;
/** Plafond signalé à 80 % d'utilisation. */
const CAP_RATIO = 0.8;

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

export function watchItems(clients: ConsoleClient[], now = Date.now()): WatchItem[] {
  const items: WatchItem[] = [];
  for (const client of clients) {
    const { access, licence } = client;
    if (access.access === 'lecture') {
      const reason = { suspendue: 'suspendue', revoquee: 'révoquée', expiree: 'échue' }[
        access.reason!
      ];
      items.push({
        group: 'licence',
        client,
        reason: `Licence ${reason} : lecture seule`,
        rank: -1,
      });
    } else if (access.daysLeft !== null && access.daysLeft <= SOON_DAYS) {
      items.push({
        group: 'licence',
        client,
        reason:
          access.daysLeft === 0
            ? 'Licence finie ce soir'
            : `Licence finie dans ${plural(access.daysLeft, 'jour')}`,
        rank: access.daysLeft,
      });
    }

    if (access.access === 'complet') {
      const age = Math.floor((now - Date.parse(client.createdAt)) / DAY);
      if (!client.lastLoginAt && age >= NEW_CLIENT_DAYS) {
        items.push({
          group: 'silence',
          client,
          reason: `Ouvert il y a ${age} jours, personne ne s'est encore connecté`,
          rank: -age,
        });
      } else if (client.lastLoginAt) {
        const silent = Math.floor((now - Date.parse(client.lastLoginAt)) / DAY);
        if (silent > SILENT_DAYS) {
          items.push({
            group: 'silence',
            client,
            reason: `Dernière connexion il y a ${silent} jours`,
            rank: -silent,
          });
        }
      }
    }

    const caps = [
      { used: client.sites, cap: licence.maxSites, word: 'sites' },
      {
        used: client.members + client.pendingInvitations,
        cap: licence.maxMembers,
        word: 'utilisateurs',
      },
      {
        used: client.analysesThisMonth,
        cap: licence.maxAnalysesPerMonth,
        word: 'analyses ce mois',
      },
    ].filter((c): c is { used: number; cap: number; word: string } => c.cap !== null && c.cap > 0);
    const tight = caps
      .map((c) => ({ ...c, ratio: c.used / c.cap }))
      .filter((c) => c.ratio >= CAP_RATIO)
      .sort((a, b) => b.ratio - a.ratio);
    if (tight.length > 0) {
      items.push({
        group: 'plafond',
        client,
        reason: tight.map((c) => `${c.used} / ${c.cap} ${c.word}`).join(' · '),
        rank: -tight[0]!.ratio,
      });
    }

    if (client.failedAnalysesThisMonth > 0) {
      items.push({
        group: 'echecs',
        client,
        reason: `${plural(client.failedAnalysesThisMonth, 'analyse')} en échec sur ${client.analysesThisMonth}`,
        rank: -client.failedAnalysesThisMonth,
      });
    }
  }
  return items.sort((a, b) => a.rank - b.rank);
}
