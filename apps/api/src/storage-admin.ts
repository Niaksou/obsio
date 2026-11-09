import { createHash, createHmac, type Hash, type Hmac } from 'node:crypto';
import { SignatureV4 } from '@smithy/signature-v4';

// Compte de stockage propre à l'application (ASVS 13.2.2) : l'API et le worker n'ont accès qu'au
// bucket d'Obsio, en lecture, écriture, suppression et liste. La clé principale de RustFS ne
// sert qu'au service setup, qui crée ce compte par l'API d'administration de RustFS
// (JSON signé en SigV4, https://docs.rustfs.com/en/security-compliance/iam).

const toBytes = (data: string | ArrayBuffer | ArrayBufferView) =>
  typeof data === 'string'
    ? data
    : ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);

/** SHA-256 de node:crypto au format attendu par le signataire SigV4. */
class Sha256 {
  private hash: Hash | Hmac;
  constructor(secret?: string | ArrayBuffer | ArrayBufferView) {
    this.hash = secret ? createHmac('sha256', toBytes(secret)) : createHash('sha256');
  }
  update(data: string | ArrayBuffer | ArrayBufferView) {
    this.hash.update(toBytes(data));
  }
  async digest() {
    return new Uint8Array(this.hash.digest());
  }
  reset() {}
}

export interface StorageAdmin {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

/** Droits du compte de l'application : objets du bucket et liste de son contenu, rien d'autre. */
export function appPolicy(bucket: string) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
      { Effect: 'Allow', Action: ['s3:ListBucket'], Resource: [`arn:aws:s3:::${bucket}`] },
    ],
  };
}

async function adminRequest(
  admin: StorageAdmin,
  path: string,
  query: Record<string, string>,
  body?: string,
) {
  const url = new URL(`/rustfs/admin/v3/${path}`, admin.endpoint);
  const signer = new SignatureV4({
    credentials: { accessKeyId: admin.accessKey, secretAccessKey: admin.secretKey },
    region: admin.region,
    service: 's3',
    sha256: Sha256,
    uriEscapePath: false,
  });
  const signed = await signer.sign({
    method: 'PUT',
    protocol: url.protocol,
    hostname: url.hostname,
    ...(url.port ? { port: Number(url.port) } : {}),
    path: url.pathname,
    query,
    headers: {
      host: url.host,
      'x-amz-content-sha256': createHash('sha256')
        .update(body ?? '')
        .digest('hex'),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
  });
  const response = await fetch(`${url.href}?${new URLSearchParams(query)}`, {
    method: 'PUT',
    headers: signed.headers,
    ...(body ? { body } : {}),
  });
  if (!response.ok) {
    throw new Error(`Stockage, ${path} : ${response.status} ${await response.text()}`);
  }
}

/** Crée ou met à jour le compte de l'application et ses droits ; peut être rejoué. */
export async function provisionAppUser(
  admin: StorageAdmin,
  app: { accessKey: string; secretKey: string; bucket: string },
) {
  if (app.accessKey === admin.accessKey) {
    throw new Error('Le compte de stockage de l’application doit différer du compte principal.');
  }
  const policy = 'obsio-app';
  await adminRequest(
    admin,
    'add-canned-policy',
    { name: policy },
    JSON.stringify(appPolicy(app.bucket)),
  );
  await adminRequest(
    admin,
    'add-user',
    { accessKey: app.accessKey },
    JSON.stringify({ secretKey: app.secretKey, status: 'enabled' }),
  );
  await adminRequest(admin, 'set-user-or-group-policy', {
    policyName: policy,
    userOrGroup: app.accessKey,
    isGroup: 'false',
  });
}
