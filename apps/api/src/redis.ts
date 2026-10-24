import { Redis } from 'ioredis';

export function createRedis(url: string): Redis {
  // maxRetriesPerRequest: null est exigé par BullMQ.
  return new Redis(url, { maxRetriesPerRequest: null });
}
