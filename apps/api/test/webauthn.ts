import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

// Authentificateur WebAuthn logiciel pour les tests : clé ES256, attestation « none ».

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest();
const b64url = (data: Buffer) => data.toString('base64url');

/** Encodeur CBOR minimal : entiers, chaînes d'octets, textes et tables. */
function cbor(value: unknown): Buffer {
  const head = (major: number, length: number) => {
    if (length < 24) return Buffer.from([(major << 5) | length]);
    if (length < 256) return Buffer.from([(major << 5) | 24, length]);
    return Buffer.from([(major << 5) | 25, length >> 8, length & 0xff]);
  };
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') {
    const text = Buffer.from(value);
    return Buffer.concat([head(3, text.length), text]);
  }
  if (value instanceof Map) {
    const parts = [...value].flatMap(([k, v]) => [cbor(k), cbor(v)]);
    return Buffer.concat([head(5, value.size), ...parts]);
  }
  throw new Error('Type CBOR non géré');
}

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED = 0x40;

export class SoftAuthenticator {
  private readonly privateKey: KeyObject;
  private readonly publicJwk: { x: string; y: string };
  readonly credentialId = randomBytes(16);
  private counter = 0;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
    /** false : simule une passkey déverrouillée sans biométrie ni code de l'appareil. */
    public userVerified = true,
  ) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = privateKey;
    this.publicJwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  }

  private flags(extra = 0) {
    return FLAG_USER_PRESENT | (this.userVerified ? FLAG_USER_VERIFIED : 0) | extra;
  }

  private clientData(type: string, challenge: string) {
    return Buffer.from(
      JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }),
    );
  }

  /** Réponse à `navigator.credentials.create()`. */
  register(options: { challenge: string }) {
    const coseKey = cbor(
      new Map<number, unknown>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(this.publicJwk.x, 'base64url')],
        [-3, Buffer.from(this.publicJwk.y, 'base64url')],
      ]),
    );
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(this.rpId),
      Buffer.from([this.flags(FLAG_ATTESTED)]),
      Buffer.alloc(4),
      Buffer.alloc(16),
      idLength,
      this.credentialId,
      coseKey,
    ]);
    const attestationObject = cbor(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    return {
      id: b64url(this.credentialId),
      rawId: b64url(this.credentialId),
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(this.clientData('webauthn.create', options.challenge)),
        attestationObject: b64url(attestationObject),
        transports: ['internal'],
      },
    };
  }

  /** Réponse à `navigator.credentials.get()`. */
  authenticate(options: { challenge: string }) {
    this.counter += 1;
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha256(this.rpId), Buffer.from([this.flags()]), count]);
    const clientDataJSON = this.clientData('webauthn.get', options.challenge);
    const signature = sign(
      'sha256',
      Buffer.concat([authData, sha256(clientDataJSON)]),
      this.privateKey,
    );
    return {
      id: b64url(this.credentialId),
      rawId: b64url(this.credentialId),
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
      },
    };
  }
}
