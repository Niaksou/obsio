import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ApiConfig } from '../config.js';
import { withOrganisation, type Database } from '../db/client.js';
import { organisation, reserve, site } from '../db/schema/index.js';
import type { EmailSender } from '../email/sender.js';
import { overdueEmail } from '../email/templates.js';
import { managerEmails } from './events.js';
import { notSuperseded, today } from './queries.js';

// Relances de retard : chaque matin, les admins reçoivent pour chaque site le nombre de réserves
// en retard, le jour où une réserve dépasse son échéance, et chaque lundi en récapitulatif.

function previousDay(day: string) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function isMonday(day: string) {
  return new Date(`${day}T12:00:00Z`).getUTCDay() === 1;
}

export interface NotificationDeps {
  db: Database;
  emailSender: EmailSender;
  config: Pick<ApiConfig, 'WEB_URL'>;
}

/** Envoie les relances du jour ; renvoie le nombre d'e-mails partis. */
export async function sendOverdueNotices(deps: NotificationDeps, on = today()): Promise<number> {
  const yesterday = previousDay(on);
  const weekly = isMonday(on);
  // La table des organisations n'est pas cloisonnée : c'est le seul parcours inter-clients.
  const organisations = await deps.db.select().from(organisation);
  let sent = 0;

  for (const org of organisations) {
    const sites = await withOrganisation(deps.db, org.id, (tx) =>
      tx
        .select({
          id: site.id,
          name: site.name,
          overdue: sql<number>`count(*)::int`,
          // Réserves dont l'échéance était hier : elles viennent de passer en retard.
          fresh: sql<number>`count(*) filter (where ${reserve.dueDate} = ${yesterday})::int`,
        })
        .from(reserve)
        .innerJoin(site, eq(site.id, reserve.siteId))
        .where(
          and(
            isNull(site.archivedAt),
            inArray(reserve.status, ['ouverte', 'assignee']),
            sql`${reserve.dueDate} < ${on}`,
            notSuperseded(tx),
          ),
        )
        .groupBy(site.id, site.name),
    );
    const due = sites.filter((s) => s.fresh > 0 || (weekly && s.overdue > 0));
    if (due.length === 0) continue;
    const admins = await managerEmails(deps.db, org.id);
    for (const s of due) {
      for (const to of admins) {
        await deps.emailSender.send(
          overdueEmail(to, {
            organisationName: org.name,
            siteName: s.name,
            count: s.overdue,
            url: `${deps.config.WEB_URL}/sites/${s.id}/reserves?vue=en_retard`,
          }),
        );
        sent += 1;
      }
    }
  }
  return sent;
}
