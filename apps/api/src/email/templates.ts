import { COLORS } from '../brand.js';
import { LOGO_CID, logoAttachment } from './logo.js';
import type { Email } from './sender.js';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const FONT = "Barlow,'Segoe UI',Helvetica,Arial,sans-serif";
const HAIRLINE = '#e3e6e5';

/**
 * Mise en page commune, selon la charte : carte blanche sur fond tôle, logo joint au message,
 * une seule action (bouton encre) et son lien en clair pour les messageries qui bloquent les
 * boutons. HTML en tableaux et styles en ligne, seule forme que Gmail et Outlook rendent
 * fidèlement. La version texte reste complète.
 */
function layout(paragraphs: string[], action: { label: string; url: string }) {
  const text = [...paragraphs, `${action.label} : ${action.url}`].join('\n\n');
  const url = escapeHtml(action.url);
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;">${escapeHtml(p)}</p>`).join('\n');
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:${COLORS.paper};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.paper};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${HAIRLINE};border-radius:12px;">
<tr><td style="padding:24px 32px 20px;border-bottom:1px solid ${HAIRLINE};">
<img src="cid:${LOGO_CID}" width="98" height="30" alt="Obsio" style="display:block;border:0;outline:none;">
</td></tr>
<tr><td style="padding:28px 32px 8px;font-family:${FONT};font-size:16px;line-height:24px;color:${COLORS.ink};">
${body}
</td></tr>
<tr><td style="padding:8px 32px 32px;font-family:${FONT};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background:${COLORS.ink};border-radius:8px;">
<a href="${url}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:15px;font-weight:500;line-height:20px;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(action.label)}</a>
</td>
</tr></table>
<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:${COLORS.faint};">Si le bouton ne s’ouvre pas, copiez ce lien dans votre navigateur :<br><a href="${url}" style="color:${COLORS.muted};word-break:break-all;">${url}</a></p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.faint};">Obsio, suivi des vérifications électriques réglementaires</p>
</td></tr>
</table>
</body>
</html>`;
  return { text, html, attachments: [logoAttachment] };
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

export type InspectionReminder = 'a_programmer' | 'en_retard' | 'visite' | 'rapport';

export function inspectionReminderEmail(
  to: string,
  data: {
    organisationName: string;
    siteName: string;
    kindLabel: string;
    reminder: InspectionReminder;
    /** Échéance, ou date de la visite programmée pour « visite » et « rapport ». */
    date: string;
    /** Réserves en cours issues de ce type de vérification (pour « visite »). */
    openReserves: number;
    url: string;
  },
): Email {
  const where = `${data.kindLabel}, site ${data.siteName} (${data.organisationName})`;
  const day = formatDate(data.date);
  const n = data.openReserves;
  const content = {
    a_programmer: {
      subject: `${data.siteName} : vérification à programmer avant le ${day}`,
      lines: [
        `${where} : la prochaine visite est attendue avant le ${day}.`,
        "Contactez l'organisme de contrôle pour convenir d'une date, puis notez-la dans Obsio.",
      ],
    },
    en_retard: {
      subject: `${data.siteName} : vérification en retard`,
      lines: [
        `${where} : l'échéance du ${day} est dépassée et aucune visite n'est programmée.`,
        "Contactez l'organisme de contrôle au plus vite.",
      ],
    },
    visite: {
      subject: `${data.siteName} : visite de l'organisme le ${day}`,
      lines: [
        `${where} : l'organisme de contrôle vient le ${day}.`,
        n > 0
          ? `${n} réserve${n > 1 ? 's' : ''} relevée${n > 1 ? 's' : ''} lors de la visite précédente ${n > 1 ? 'sont' : 'est'} encore en cours : sans correction d'ici là, ${n > 1 ? 'elles seront reconduites' : 'elle sera reconduite'}.`
          : 'Toutes les réserves de la visite précédente sont corrigées.',
      ],
    },
    rapport: {
      subject: `${data.siteName} : rapport de vérification à importer`,
      lines: [
        `${where} : la visite était prévue le ${day}.`,
        "Importez le rapport dès que l'organisme l'envoie, pour suivre les nouvelles réserves.",
      ],
    },
  }[data.reminder];
  return {
    to,
    subject: content.subject,
    ...layout(['Bonjour,', ...content.lines], { label: 'Voir les vérifications', url: data.url }),
  };
}
