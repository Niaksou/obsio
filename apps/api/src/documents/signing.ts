import { createHash, generateKeyPairSync } from 'node:crypto';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import { SignPdf } from '@signpdf/signpdf';
import { Signer, SUBFILTER_ADOBE_PKCS7_DETACHED } from '@signpdf/utils';
import forge from 'node-forge';

// Signature électronique des documents émis (dossiers de preuves) : signature PDF détachée
// (PKCS#7, SHA-256), lue par Adobe Reader et les lecteurs courants. Le certificat est pour
// l'instant auto-signé : la signature prouve que le fichier n'a pas changé depuis l'émission,
// mais Adobe affiche « identité inconnue » tant que le certificat n'est pas émis par une
// autorité de la liste AATL (voir docs/securite.md, « Écarts »).

export interface DocumentSigner {
  /** Signe le PDF et renvoie le fichier final. */
  sign(pdf: Buffer, info: { reason: string; location: string }): Promise<Buffer>;
  /** Empreinte SHA-256 du certificat (DER, hexadécimal), enregistrée avec chaque document. */
  fingerprint: string;
  /** Nom du signataire, tel qu'il figure dans le certificat. */
  name: string;
}

class ForgeSigner extends Signer {
  constructor(
    private readonly key: forge.pki.PrivateKey,
    private readonly certificate: forge.pki.Certificate,
  ) {
    super();
  }

  override async sign(pdfBuffer: Buffer, signingTime = new Date()): Promise<Buffer> {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'));
    p7.addCertificate(this.certificate);
    p7.addSigner({
      key: this.key as forge.pki.rsa.PrivateKey,
      certificate: this.certificate,
      digestAlgorithm: forge.pki.oids.sha256!,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType!, value: forge.pki.oids.data! },
        { type: forge.pki.oids.messageDigest! },
        { type: forge.pki.oids.signingTime!, value: signingTime as unknown as string },
      ],
    });
    p7.sign({ detached: true });
    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
  }
}

const signPdf = new SignPdf();

function fromPem(keyPem: string, certificatePem: string): DocumentSigner {
  const key = forge.pki.privateKeyFromPem(keyPem);
  const certificate = forge.pki.certificateFromPem(certificatePem);
  const der = Buffer.from(
    forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(),
    'binary',
  );
  const name = String(certificate.subject.getField('CN')?.value ?? 'Obsio');
  const signer = new ForgeSigner(key, certificate);
  return {
    fingerprint: createHash('sha256').update(der).digest('hex'),
    name,
    async sign(pdf, info) {
      const withPlaceholder = plainAddPlaceholder({
        pdfBuffer: pdf,
        reason: info.reason,
        location: info.location,
        name,
        contactInfo: '',
        appName: 'Obsio',
        subFilter: SUBFILTER_ADOBE_PKCS7_DETACHED,
        // Certificat RSA 3072 et attributs : la signature tient largement dans 8 Ko.
        signatureLength: 8192,
      });
      return signPdf.sign(withPlaceholder, signer);
    },
  };
}

/**
 * Certificat de développement et de test, tiré au démarrage (jamais en production, où la clé
 * est un secret du déploiement créé par deploy/secrets.sh).
 */
function ephemeral(): DocumentSigner {
  // Clé tirée par OpenSSL (rapide), certificat construit par node-forge.
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const privateKey = forge.pki.privateKeyFromPem(pair.privateKey);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = forge.pki.publicKeyFromPem(pair.publicKey);
  certificate.serialNumber = `01${forge.util.bytesToHex(forge.random.getBytesSync(8))}`;
  certificate.validity.notBefore = new Date();
  certificate.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const subject: forge.pki.CertificateField[] = [
    {
      name: 'commonName',
      value: 'Obsio (développement)',
      valueTagClass: forge.asn1.Type.UTF8 as unknown as forge.asn1.Class,
    },
    { name: 'organizationName', value: 'Obsio' },
  ];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
  ]);
  certificate.sign(privateKey, forge.md.sha256.create());
  return fromPem(pair.privateKey, forge.pki.certificateToPem(certificate));
}

let devSigner: DocumentSigner | null = null;

export function createDocumentSigner(config: {
  DOCUMENT_SIGNING_KEY?: string | undefined;
  DOCUMENT_SIGNING_CERT?: string | undefined;
}): DocumentSigner {
  if (config.DOCUMENT_SIGNING_KEY && config.DOCUMENT_SIGNING_CERT) {
    return fromPem(config.DOCUMENT_SIGNING_KEY, config.DOCUMENT_SIGNING_CERT);
  }
  devSigner ??= ephemeral();
  return devSigner;
}
