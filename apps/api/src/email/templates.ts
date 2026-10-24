import type { Email } from './sender.js';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function layout(paragraphs: string[], action: { label: string; url: string }) {
  const text = [...paragraphs, `${action.label} : ${action.url}`].join('\n\n');
  const html = [
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<p><a href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a></p>`,
  ].join('\n');
  return { text, html };
}

export function verificationEmail(to: string, url: string): Email {
  return {
    to,
    subject: 'Confirmez votre adresse e-mail',
    ...layout(
      [
        'Bonjour,',
        'Pour activer votre compte, confirmez votre adresse e-mail.',
        "Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.",
      ],
      { label: 'Confirmer mon adresse', url },
    ),
  };
}

export function resetPasswordEmail(to: string, url: string): Email {
  return {
    to,
    subject: 'Réinitialisation de votre mot de passe',
    ...layout(
      [
        'Bonjour,',
        'Vous avez demandé à réinitialiser votre mot de passe.',
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
      ],
      { label: 'Choisir un nouveau mot de passe', url },
    ),
  };
}

export function invitationEmail(
  to: string,
  data: { inviterName: string; organisationName: string; url: string },
): Email {
  return {
    to,
    subject: `Invitation à rejoindre ${data.organisationName}`,
    ...layout(
      [
        'Bonjour,',
        `${data.inviterName} vous invite à rejoindre l'organisation ${data.organisationName}.`,
        "L'invitation est valable 7 jours.",
      ],
      { label: "Accepter l'invitation", url: data.url },
    ),
  };
}
