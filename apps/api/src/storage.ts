import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
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

    /**
     * Lien de lecture à courte durée. Un PDF est servi en pièce jointe : le stockage interdit
     * tout contenu actif (CSP sandbox, deploy/server/Caddyfile), le lecteur PDF intégré du
     * navigateur compris ; le front l'affiche avec pdf.js, que l'en-tête ne gêne pas.
     */
    signedDownloadUrl(key: string) {
      const name = key.split('/').at(-1) ?? 'fichier';
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ...(key.endsWith('.pdf')
            ? { ResponseContentDisposition: `attachment; filename="${name}"` }
            : {}),
        }),
        { expiresIn: DOWNLOAD_EXPIRES_IN },
      );
    },

    /** Contenu de l'objet, ou null s'il n'existe pas. */
    async get(key: string): Promise<Buffer | null> {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return response.Body ? Buffer.from(await response.Body.transformToByteArray()) : null;
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    },

    /** Premiers octets de l'objet (signature du fichier), ou null s'il n'existe pas. */
    async head(key: string, bytes: number): Promise<Buffer | null> {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
        );
        return response.Body ? Buffer.from(await response.Body.transformToByteArray()) : null;
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    },

    async put(key: string, body: Buffer | string, contentType: string) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    /** Seuls les fichiers techniques (résultat d'extraction relancée) sont supprimés. */
    async remove(key: string) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    /** Tous les objets sous un préfixe, avec leur taille en octets. */
    async list(prefix: string): Promise<{ key: string; size: number }[]> {
      const objects: { key: string; size: number }[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        );
        for (const object of page.Contents ?? []) {
          if (object.Key) objects.push({ key: object.Key, size: object.Size ?? 0 });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return objects;
    },

    /** Suppression d'une organisation entière uniquement (voir organisations/delete.ts). */
    async removeMany(keys: string[]) {
      for (let start = 0; start < keys.length; start += 1000) {
        const batch = keys.slice(start, start + 1000);
        const result = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: true },
          }),
        );
        const failed = result.Errors ?? [];
        if (failed.length > 0) {
          throw new Error(`${failed.length} fichiers non supprimés (${failed[0]?.Message ?? ''})`);
        }
      }
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
