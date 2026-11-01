import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { sendInspectionReminders } from './inspections/reminders.js';
import { sendOverdueNotices, type NotificationDeps } from './reserves/overdue.js';

const NOTIFICATIONS_QUEUE = 'notifications';

/**
 * Planifie les relances du matin, chaque jour à 8 h (heure de Paris) : réserves en retard et
 * échéancier des vérifications. Le planificateur BullMQ ne crée qu'une tâche par échéance, même
 * avec plusieurs instances de l'API.
 */
export async function scheduleDailyNotifications(
  connection: Redis,
  deps: NotificationDeps,
  log: { error: (obj: object, msg: string) => void; info: (msg: string) => void },
) {
  const queue = new Queue(NOTIFICATIONS_QUEUE, { connection });
  // Ancien nom de la tâche, quand seules les relances de retard existaient.
  await queue.removeJobScheduler('overdue-daily');
  await queue.upsertJobScheduler(
    'notifications-daily',
    { pattern: '0 8 * * *', tz: 'Europe/Paris' },
    { name: 'daily-notifications', opts: { removeOnComplete: 30, removeOnFail: 30 } },
  );
  const worker = new Worker(
    NOTIFICATIONS_QUEUE,
    async () => {
      const overdue = await sendOverdueNotices(deps);
      const inspections = await sendInspectionReminders(deps);
      log.info(
        `Relances du matin : ${overdue} e-mail(s) de retard, ${inspections} pour l'échéancier`,
      );
    },
    { connection: connection.duplicate() },
  );
  worker.on('failed', (_job, error) => log.error({ err: error }, 'Relances du matin en échec'));
  return {
    async close() {
      await Promise.all([worker.close(), queue.close()]);
    },
  };
}
