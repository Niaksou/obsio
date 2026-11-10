import { describe, expect, it } from 'vitest';
import { LOGO_CID } from '../src/email/logo.js';
import { assignmentEmail } from '../src/email/templates.js';

describe('e-mails aux couleurs de la marque', () => {
  const mail = assignmentEmail('electricien@exemple.fr', {
    organisationName: 'Usine <b>Dupont</b>',
    reserveCount: 2,
    dueDate: null,
    message: 'Accès par le quai "B" & badge',
    url: 'https://app.obsio.fr/intervention/abc?x=1&y=2',
  });

  it('joint le logo et l’appelle par son identifiant, sans image distante', () => {
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments![0]).toMatchObject({ cid: LOGO_CID, contentType: 'image/png' });
    expect(mail.attachments![0]!.content.subarray(1, 4).toString()).toBe('PNG');
    expect(mail.html).toContain(`src="cid:${LOGO_CID}"`);
    expect(mail.html).not.toMatch(/src="https?:/);
  });

  it('échappe le contenu fourni par les utilisateurs', () => {
    expect(mail.html).not.toContain('<b>Dupont</b>');
    expect(mail.html).toContain('Usine &#60;b&#62;Dupont&#60;/b&#62;');
    expect(mail.html).toContain('href="https://app.obsio.fr/intervention/abc?x=1&#38;y=2"');
  });

  it('garde une version texte complète, avec le lien', () => {
    expect(mail.text).toContain('Usine <b>Dupont</b> vous confie 2 réserves');
    expect(mail.text).toContain(
      'Ouvrir mes réserves : https://app.obsio.fr/intervention/abc?x=1&y=2',
    );
  });
});
