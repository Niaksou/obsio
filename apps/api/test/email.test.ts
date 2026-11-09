import { describe, expect, it } from 'vitest';
import { smtpOptions } from '../src/email/sender.js';

const base = { SMTP_HOST: 'smtp', SMTP_PORT: 587, MAIL_FROM: 'Obsio <ne-pas-repondre@obsio.fr>' };

describe('SMTP', () => {
  it('exige TLS 1.2 pour un relais authentifié', () => {
    const options = smtpOptions({ ...base, SMTP_USER: 'compte', SMTP_PASSWORD: 'secret' });
    expect(options).toMatchObject({
      requireTLS: true,
      secure: false,
      tls: { minVersion: 'TLSv1.2' },
      auth: { user: 'compte', pass: 'secret' },
    });
  });

  it('reste en clair sans identifiant (Mailpit local)', () => {
    const options = smtpOptions({ ...base, SMTP_PORT: 1025, SMTP_USER: undefined });
    expect(options.requireTLS).toBe(false);
    expect(options.auth).toBeUndefined();
  });
});
