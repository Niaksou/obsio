import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { WorkerConfig } from './config.js';

/** Accès au stockage objet, réduit à ce dont le worker a besoin (remplaçable en test). */
export interface ObjectStorage {
  /** Contenu de l'objet, ou `null` s'il n'existe pas. */
  get(key: string): Promise<Buffer | null>;
  put(key: string, body: Buffer | string, contentType: string): Promise<void>;
}

export function createS3Storage(config: WorkerConfig) {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
  });
  const bucket = config.S3_BUCKET;

  const storage: ObjectStorage & { ensureBucket(): Promise<void>; close(): void } = {
    async get(key) {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return response.Body ? Buffer.from(await response.Body.transformToByteArray()) : null;
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    },

    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    /** Crée le bucket s'il manque (développement et tests ; en production il est provisionné). */
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    },

    close() {
      client.destroy();
    },
  };
  return storage;
}
