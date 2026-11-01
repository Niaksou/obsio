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

export function assignmentEmail(
  to: string,
  data: {
    organisationName: string;
    reserveCount: number;
    dueDate: string | null;
    message: string | null;
    url: string;
  },
): Email {
  const n = data.reserveCount;
  return {
    to,
    subject: `${data.organisationName} : ${n} réserve${n > 1 ? 's' : ''} à corriger`,
    ...layout(
      [
        'Bonjour,',
        `${data.organisationName} vous confie ${n} réserve${n > 1 ? 's' : ''} électrique${n > 1 ? 's' : ''} à corriger${data.dueDate ? ` avant le ${formatDate(data.dueDate)}` : ''}.`,
        ...(data.message ? [data.message] : []),
        'Le lien ci-dessous ouvre la liste sur votre téléphone, sans compte : pour chaque réserve, prenez une photo de la correction, ajoutez un commentaire et indiquez qu’elle est corrigée. Les envois partent dès que le réseau revient.',
      ],
      { label: 'Ouvrir mes réserves', url: data.url },
    ),
  };
}

export function correctionEmail(
  to: string,
  data: { author: string; description: string; url: string },
): Email {
  return {
    to,
    subject: `Réserve corrigée par ${data.author}`,
    ...layout(
      [
        'Bonjour,',
        `${data.author} indique avoir corrigé la réserve suivante : « ${data.description} ».`,
        'Vérifiez la preuve jointe, puis levez la réserve ou refusez la correction.',
      ],
      { label: 'Vérifier la réserve', url: data.url },
    ),
  };
}

export function overdueEmail(
  to: string,
  data: { organisationName: string; siteName: string; count: number; url: string },
): Email {
  const n = data.count;
  return {
    to,
    subject: `${data.siteName} : ${n} réserve${n > 1 ? 's' : ''} en retard`,
    ...layout(
      [
        'Bonjour,',
        `${n} réserve${n > 1 ? 's' : ''} du site ${data.siteName} (${data.organisationName}) ${n > 1 ? 'ont' : 'a'} dépassé leur échéance sans être corrigée${n > 1 ? 's' : ''}.`,
      ],
      { label: 'Voir les réserves en retard', url: data.url },
    ),
  };
}

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
