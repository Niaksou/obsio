import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignedPost } from '@obsio/shared';
import type { ApiConfig } from './config.js';

/** Durée de validité des liens signés : le stockage reste privé (spec, « Sécurité »). */
const UPLOAD_EXPIRES_IN = 10 * 60;
const DOWNLOAD_EXPIRES_IN = 15 * 60;

export function createStorage(config: ApiConfig) {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
  });
  const bucket = config.S3_BUCKET;

  return {
    /** Formulaire d'envoi direct depuis le navigateur, limité en type et en taille. */
    async presignedUpload(
      key: string,
      contentType: string,
      maxBytes: number,
    ): Promise<PresignedPost> {
      const { url, fields } = await createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Conditions: [
          ['content-length-range', 1, maxBytes],
          ['eq', '$Content-Type', contentType],
        ],
        Fields: { 'Content-Type': contentType },
        Expires: UPLOAD_EXPIRES_IN,
      });
      return { key, url, fields };
    },

    signedDownloadUrl(key: string) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: DOWNLOAD_EXPIRES_IN,
      });
    },

    /** Type de contenu de l'objet, ou null s'il n'existe pas. */
    async contentType(key: string): Promise<string | null> {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return head.ContentType ?? '';
      } catch (error) {
        if (error instanceof NotFound) return null;
        throw error;
      }
    },

    /** Développement et tests : crée le bucket et autorise l'envoi depuis le front. */
    async ensureBucket(webUrl: string) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
      await client.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [
              { AllowedOrigins: [webUrl], AllowedMethods: ['GET', 'POST'], AllowedHeaders: ['*'] },
            ],
          },
        }),
      );
    },

    close() {
      client.destroy();
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;
