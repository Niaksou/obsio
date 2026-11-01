import { daysBetween, INSPECTION_KIND_LABELS, type Inspection } from '@obsio/shared';
import type { ApiConfig } from '../config.js';
import { withOrganisation, type Database } from '../db/client.js';
import { organisation } from '../db/schema/index.js';
import type { EmailSender } from '../email/sender.js';
import { inspectionReminderEmail, type InspectionReminder } from '../email/templates.js';
import { adminEmails } from '../reserves/events.js';
import { listReserves, today } from '../reserves/queries.js';
import { KIND_DOCUMENTS, listInspections } from './schedule.js';

// Relances de l'échéancier, envoyées aux admins avec les relances de retard du matin. Elles
// tombent à un jour précis (pas de suivi des envois) : 60 et 30 jours avant l'échéance sans
// visite programmée, le lendemain de l'échéance, 7 jours avant une visite programmée, et 7 jours
// après si son rapport n'est pas importé.

interface Deps {
  db: Database;
  emailSender: EmailSender;
  config: Pick<ApiConfig, 'WEB_URL'>;
}

export function reminderFor(
  inspection: Pick<Inspection, 'status' | 'dueDate' | 'plannedDate'>,
  on: string,
): { reminder: InspectionReminder; date: string } | null {
  const { status, dueDate, plannedDate } = inspection;
  if (status === 'desactivee') return null;
  if (plannedDate) {
    const days = daysBetween(on, plannedDate);
    if (days === 7) return { reminder: 'visite', date: plannedDate };
    if (days === -7) return { reminder: 'rapport', date: plannedDate };
    return null;
  }
  if (!dueDate) return null;
  const days = daysBetween(on, dueDate);
  if (days === 60 || days === 30) return { reminder: 'a_programmer', date: dueDate };
  if (days === -1) return { reminder: 'en_retard', date: dueDate };
  return null;
}

/** Envoie les relances du jour ; renvoie le nombre d'e-mails partis. */
export async function sendInspectionReminders(deps: Deps, on = today()): Promise<number> {
  // La table des organisations n'est pas cloisonnée : c'est le seul parcours inter-clients.
  const organisations = await deps.db.select().from(organisation);
  let sent = 0;

  for (const org of organisations) {
    const due = await withOrganisation(deps.db, org.id, async (tx) => {
      const found = [];
      for (const inspection of await listInspections(tx, { on })) {
        const reminder = reminderFor(inspection, on);
        if (!reminder) continue;
        let openReserves = 0;
        if (reminder.reminder === 'visite') {
          const types = KIND_DOCUMENTS[inspection.kind];
          openReserves = (await listReserves(tx, inspection.siteId)).filter(
            (r) =>
              (r.status === 'ouverte' || r.status === 'assignee') &&
              r.sources.some((s) => types.includes(s.documentType)),
          ).length;
        }
        found.push({ inspection, ...reminder, openReserves });
      }
      return found;
    });
    if (due.length === 0) continue;
    const admins = await adminEmails(deps.db, org.id);
    for (const { inspection, reminder, date, openReserves } of due) {
      for (const to of admins) {
        await deps.emailSender.send(
          inspectionReminderEmail(to, {
            organisationName: org.name,
            siteName: inspection.siteName,
            kindLabel: INSPECTION_KIND_LABELS[inspection.kind],
            reminder,
            date,
            openReserves,
            url: `${deps.config.WEB_URL}/verifications`,
          }),
        );
        sent += 1;
      }
    }
  }
  return sent;
}
