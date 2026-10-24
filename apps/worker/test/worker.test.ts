import { EXTRACTION_QUEUE } from '@obsio/shared';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { startWorker } from '../src/worker.js';

// File isolée par exécution pour ne pas interférer avec un worker de dev lancé à côté.
const prefix = `test-${crypto.randomUUID()}`;
const config = loadConfig();
const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(EXTRACTION_QUEUE, { connection, prefix });
const events = new QueueEvents(EXTRACTION_QUEUE, { connection: connection.duplicate(), prefix });
const running = startWorker(config, pino({ level: 'silent' }), { prefix });

afterAll(async () => {
  await running.close();
  await queue.obliterate({ force: true });
  await Promise.all([queue.close(), events.close()]);
  await connection.quit();
});

describe("worker d'extraction", () => {
  it('traite une tâche ping', async () => {
    const job = await queue.add('ping', { sentAt: new Date().toISOString() });
    const result = await job.waitUntilFinished(events, 5000);
    expect(result).toHaveProperty('receivedAt');
  });

  it('rejette une charge utile invalide', async () => {
    const job = await queue.add('ping', { sentAt: 'pas une date' }, { attempts: 1 });
    await expect(job.waitUntilFinished(events, 5000)).rejects.toThrow();
  });

  it('rejette une tâche inconnue', async () => {
    const job = await queue.add('inconnue', {}, { attempts: 1 });
    await expect(job.waitUntilFinished(events, 5000)).rejects.toThrow(/Tâche inconnue/);
  });
});
