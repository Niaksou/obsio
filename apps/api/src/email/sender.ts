import nodemailer from 'nodemailer';
import type { ApiConfig } from '../config.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Images appelées dans le HTML par leur identifiant (cid), comme le logo. */
  attachments?: { filename: string; content: Buffer; contentType: string; cid: string }[];
}

/** Envoi d'e-mails, derrière une interface pour pouvoir changer de fournisseur. */
export interface EmailSender {
  send(email: Email): Promise<void>;
}

type SmtpConfig = Pick<
  ApiConfig,
  'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASSWORD' | 'MAIL_FROM'
>;

/**
 * Relais authentifié (Brevo) : TLS obligatoire, 1.2 au moins (ASVS 12.3.1), sinon l'envoi est
 * refusé plutôt que de faire passer identifiants et liens en clair. Sans identifiant (Mailpit
 * sur le poste ou dans le compose), la connexion reste locale et en clair.
 */
export function smtpOptions(config: SmtpConfig) {
  const authenticated = Boolean(config.SMTP_USER);
  return {
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    requireTLS: authenticated,
    tls: { minVersion: 'TLSv1.2' as const },
    auth: authenticated ? { user: config.SMTP_USER!, pass: config.SMTP_PASSWORD } : undefined,
  };
}

export function createSmtpSender(config: SmtpConfig): EmailSender {
  const transport = nodemailer.createTransport(smtpOptions(config));
  return {
    async send(email) {
      await transport.sendMail({ from: config.MAIL_FROM, ...email });
    },
  };
}

/** Garde les e-mails en mémoire, pour les tests. */
export function createMemorySender(): EmailSender & { sent: Email[] } {
  const sent: Email[] = [];
  return {
    sent,
    async send(email) {
      sent.push(email);
    },
  };
}
