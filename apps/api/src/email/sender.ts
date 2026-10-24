import nodemailer from 'nodemailer';
import type { ApiConfig } from '../config.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Envoi d'e-mails, derrière une interface pour pouvoir changer de fournisseur. */
export interface EmailSender {
  send(email: Email): Promise<void>;
}

export function createSmtpSender(
  config: Pick<ApiConfig, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASSWORD' | 'MAIL_FROM'>,
): EmailSender {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
  });
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
