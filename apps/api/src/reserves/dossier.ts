import {
  DOCUMENT_TYPE_LABELS,
  RESERVE_STATUS_LABELS,
  type DocumentType,
  type ReserveEvent,
  type ReserveListItem,
} from '@obsio/shared';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { COLORS, FONTS, LOGO } from '../brand.js';
import type { Transaction } from '../db/client.js';
import type { Storage } from '../storage.js';
import { listReserves, reserveDetail, reserveProofs } from './queries.js';

// Dossier de preuves d'un site, en PDF : page de garde (avancement, cartouche, vérification),
// sommaire des réserves, puis pour chacune son origine, son historique et les preuves en photo.
// Filtrable par origine (dossier pour l'assureur avec le Q18, ou réglementaire).

// Mise en forme selon la charte (docs/marque/charte.html) : Barlow pour le texte, Barlow Semi
// Condensed pour les titres et les plaques gravées des repères d'équipement, statuts en pastille.
const INK = COLORS.ink;
const MUTED = COLORS.muted;
const FAINT = COLORS.faint;
const LINE = COLORS.line;
const F = {
  regular: 'Barlow',
  medium: 'Barlow-Medium',
  title: 'Barlow-Title',
  plate: 'Barlow-Plate',
};
const STATUS_COLORS: Record<ReserveListItem['status'], string> = {
  ouverte: COLORS.danger,
  assignee: COLORS.cobalt,
  corrigee: COLORS.pending,
  levee: COLORS.patina,
};
const LEFT = 50;
const PHOTO_WIDTH = 150;
const PHOTO_HEIGHT = 112;
const PHOTO_GAP = 10;

export interface DossierOptions {
  organisationName: string;
  site: { id: string; name: string; address: string | null };
  documentType?: DocumentType | undefined;
  scope: 'levees' | 'toutes';
  /**
   * Document émis et enregistré : son numéro et le QR code de vérification en dérivent. Absent
   * pour les dossiers de l'export des données, qui ne sont ni signés ni enregistrés.
   */
  registration?: { documentId: string; verifyUrl: string };
  /** Nom de la personne qui émet le dossier. */
  issuedBy: string;
  issuedAt: Date;
}

export interface Dossier {
  pdf: Buffer;
  reserveCount: number;
  liftedCount: number;
}

/** Numéro lisible d'un document émis : les 8 premiers caractères de son identifiant. */
export const documentNumber = (id: string) => `${id.slice(0, 4)}-${id.slice(4, 8)}`.toUpperCase();

function day(value: string | Date, month: 'long' | 'short' = 'long') {
  const date = typeof value === 'string' ? new Date(`${value}T12:00:00`) : value;
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month,
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}

/** Libellé du statut, avec la date qui compte : levée le…, échéance le… */
function statusLine(item: ReserveListItem, liftedAt: string | null): string {
  if (item.status === 'levee') return liftedAt ? `Levée le ${day(new Date(liftedAt))}` : 'Levée';
  const label = RESERVE_STATUS_LABELS[item.status];
  if (item.status === 'ouverte' || item.status === 'assignee') {
    return `${label}${item.dueDate ? `, échéance le ${day(item.dueDate)}` : ''}${item.overdue ? ' (en retard)' : ''}`;
  }
  return `${label}, en attente de vérification`;
}

/** Actions retenues dans l'historique du dossier : ce qui fait foi, pas les commentaires. */
function describeEvent(event: ReserveEvent): string | null {
  const data = event.data;
  const due = typeof data.dueDate === 'string' ? `, pour le ${day(data.dueDate)}` : '';
  switch (event.type) {
    case 'creee':
      return 'a activé la réserve depuis le rapport';
    case 'reconduite':
      return 'a activé la réserve, reconduite du rapport précédent';
    case 'assignee':
      return `a assigné la réserve à ${String(data.contractor ?? 'un intervenant')}${due}`;
    case 'collaborateur_assigne':
      return `a confié la réserve à ${String(data.collaborator ?? 'un collaborateur')}${due}`;
    case 'preuve': {
      const photos = Number(data.photos ?? 0);
      return `a ajouté une preuve${photos ? ` (${photos} photo${photos > 1 ? 's' : ''})` : ''}`;
    }
    case 'corrigee':
      return 'a indiqué la réserve corrigée';
    case 'correction_refusee':
      return 'a refusé la correction';
    case 'levee':
      return 'a levé la réserve';
    default:
      return null;
  }
}

/** Ne garde que JPEG et PNG, les seuls formats que pdfkit sait intégrer. */
function embeddable(buffer: Buffer) {
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const png = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return jpeg || png;
}

type Doc = InstanceType<typeof PDFDocument>;

/** Logo vectoriel, haut de sa boîte en (x, y), à la hauteur donnée. Renvoie sa largeur. */
function drawLogo(doc: Doc, x: number, y: number, height: number) {
  const scale = height / LOGO.height;
  doc
    .save()
    .translate(x, y - LOGO.top * scale)
    .scale(scale);
  doc.circle(LOGO.ring.cx, LOGO.ring.cy, LOGO.ring.r).fill(INK);
  doc.circle(LOGO.core.cx, LOGO.core.cy, LOGO.core.r).fill(COLORS.copper);
  doc.path(LOGO.letters).fill(INK);
  doc.restore();
  return LOGO.width * scale;
}

/** Plaque gravée d'un repère d'équipement, comme dans l'application. Renvoie sa largeur. */
function drawPlate(doc: Doc, label: string, x: number, y: number, maxWidth = 200) {
  doc.font(F.plate).fontSize(9);
  const w = Math.min(doc.widthOfString(label) + 10, maxWidth);
  doc.roundedRect(x, y, w, 14, 2).fill(INK);
  doc.fillColor('#ffffff').text(label, x + 5, y + 2.2, {
    width: w - 10,
    height: 12,
    ellipsis: true,
    lineBreak: false,
  });
  return w;
}

/** QR code en carrés vectoriels (net à toute échelle), coin haut gauche en (x, y). */
function drawQr(doc: Doc, text: string, x: number, y: number, size: number) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const cell = size / modules.size;
  doc.save().fillColor(INK);
  for (let row = 0; row < modules.size; row += 1) {
    for (let col = 0; col < modules.size; col += 1) {
      if (modules.get(row, col)) doc.rect(x + col * cell, y + row * cell, cell, cell);
    }
  }
  doc.fill().restore();
}

export async function buildProofDossier(
  tx: Transaction,
  storage: Storage,
  options: DossierOptions,
): Promise<Dossier> {
  const all = await listReserves(tx, options.site.id, {
    ...(options.documentType ? { documentType: options.documentType } : {}),
  });
  const reserves = options.scope === 'levees' ? all.filter((r) => r.status === 'levee') : all;
  const proofs = await reserveProofs(
    tx,
    storage,
    reserves.map((r) => r.id),
  );
  const details = new Map<string, NonNullable<Awaited<ReturnType<typeof reserveDetail>>>>();
  for (const item of reserves) {
    const detail = await reserveDetail(tx, storage, item.id);
    if (detail) details.set(item.id, detail);
  }
  const liftedAt = (id: string) =>
    [...(details.get(id)?.events ?? [])].reverse().find((e) => e.type === 'levee')?.createdAt ??
    null;

  const number = options.registration ? documentNumber(options.registration.documentId) : null;
  const titled = number ? `Dossier de preuves n° ${number}` : 'Dossier de preuves';
  const doc = new PDFDocument({
    size: 'A4',
    margin: LEFT,
    bufferPages: true,
    info: {
      Title: `${titled}, ${options.site.name}`,
      Author: options.organisationName,
      Creator: 'Obsio',
      CreationDate: options.issuedAt,
    },
  });
  doc.registerFont(F.regular, FONTS.regular);
  doc.registerFont(F.medium, FONTS.medium);
  doc.registerFont(F.title, FONTS.title);
  doc.registerFont(F.plate, FONTS.plate);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks))),
  );
  const width = doc.page.width - 2 * LEFT;
  const right = LEFT + width;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (height: number) => {
    if (doc.y + height > bottom()) doc.addPage();
  };
  const rule = (y: number, color: string = LINE, weight = 1) =>
    doc.moveTo(LEFT, y).lineTo(right, y).lineWidth(weight).strokeColor(color).stroke().lineWidth(1);

  // ——— Page de garde ———
  drawLogo(doc, LEFT, 50, 20);
  doc
    .fillColor(FAINT)
    .font(F.regular)
    .fontSize(9)
    .text(titled, LEFT, 56, { width, align: 'right' });
  rule(84, INK, 1.5);

  doc.fillColor(INK).font(F.title).fontSize(30).text(options.site.name, LEFT, 112, { width });
  if (options.site.address) {
    doc.fillColor(MUTED).font(F.regular).fontSize(11).text(options.site.address, { width });
  }
  doc.moveDown(0.8);
  doc
    .fillColor(INK)
    .font(F.regular)
    .fontSize(11)
    .text(
      options.scope === 'levees'
        ? `Réserves levées au ${day(options.issuedAt)}, avec l’historique de leur traitement et les preuves de correction.`
        : `État des réserves au ${day(options.issuedAt)}, avec l’historique de leur traitement et les preuves de correction.`,
      { width: width * 0.8 },
    );

  // Avancement : le chiffre qui compte, puis une barre segmentée par état.
  const count = (status: ReserveListItem['status']) =>
    reserves.filter((r) => r.status === status).length;
  const lifted = count('levee');
  const segments: [number, string, string][] = [
    [lifted, COLORS.patina, lifted > 1 ? 'levées' : 'levée'],
    [count('corrigee'), COLORS.pending, 'corrigées, à vérifier'],
    [count('assignee'), COLORS.cobalt, count('assignee') > 1 ? 'assignées' : 'assignée'],
    [count('ouverte'), COLORS.danger, count('ouverte') > 1 ? 'ouvertes' : 'ouverte'],
  ];
  const figTop = doc.y + 28;
  doc
    .fillColor(INK)
    .font(F.title)
    .fontSize(44)
    .text(String(lifted), LEFT, figTop, { lineBreak: false });
  const figW = doc.widthOfString(String(lifted));
  doc
    .fillColor(MUTED)
    .font(F.regular)
    .fontSize(13)
    .text(
      `${lifted > 1 ? 'réserves levées' : 'réserve levée'} sur ${reserves.length}`,
      LEFT + figW + 10,
      figTop + 27,
      { lineBreak: false },
    );
  const barTop = figTop + 62;
  const barH = 10;
  if (reserves.length > 0) {
    const visible = segments.filter(([n]) => n > 0);
    const gap = 2;
    const usable = width - gap * (visible.length - 1);
    let x = LEFT;
    for (const [n, color] of visible) {
      const w = (n / reserves.length) * usable;
      doc.roundedRect(x, barTop, w, barH, 2).fill(color);
      x += w + gap;
    }
  } else {
    doc.roundedRect(LEFT, barTop, width, barH, 2).fill(COLORS.paperDeep);
  }
  let legendX = LEFT;
  doc.font(F.regular).fontSize(9);
  for (const [n, color, label] of segments) {
    const text = `${n} ${label}`;
    doc.circle(legendX + 3, barTop + barH + 16.5, 3).fill(color);
    doc.fillColor(MUTED).text(text, legendX + 10, barTop + barH + 11, { lineBreak: false });
    legendX += 10 + doc.widthOfString(text) + 22;
  }
  const overdue = reserves.filter((r) => r.overdue).length;
  if (overdue > 0) {
    doc.fillColor(COLORS.danger).text(`dont ${overdue} en retard`, LEFT, barTop + barH + 11, {
      width,
      align: 'right',
      lineBreak: false,
    });
  }

  // Cartouche : les faits du dossier rangés en cases, comme le bloc-titre d'un plan.
  const facts: [string, string][] = [
    ['Organisation', options.organisationName],
    ['Document', number ? `n° ${number}` : 'Export des données'],
    [
      'Origine',
      options.documentType ? DOCUMENT_TYPE_LABELS[options.documentType] : 'Tous les rapports',
    ],
    ['Périmètre', options.scope === 'levees' ? 'Réserves levées' : 'Toutes les réserves'],
    ['Établi le', day(options.issuedAt)],
    ['Établi par', options.issuedBy],
  ];
  const cellW = width / 2;
  const cellH = 40;
  const top = barTop + barH + 52;
  facts.forEach(([label, value], i) => {
    const cx = LEFT + (i % 2) * cellW;
    const cy = top + Math.floor(i / 2) * cellH;
    doc
      .fillColor(FAINT)
      .font(F.regular)
      .fontSize(8)
      .text(label, cx + 10, cy + 7, { lineBreak: false });
    doc
      .fillColor(INK)
      .font(F.plate)
      .fontSize(12)
      .text(value, cx + 10, cy + 18, {
        width: cellW - 20,
        height: 16,
        ellipsis: true,
        lineBreak: false,
      });
  });
  const rows = Math.ceil(facts.length / 2);
  doc
    .strokeColor(INK)
    .rect(LEFT, top, width, rows * cellH)
    .stroke();
  doc
    .moveTo(LEFT + cellW, top)
    .lineTo(LEFT + cellW, top + rows * cellH)
    .stroke();
  for (let r = 1; r < rows; r += 1) {
    doc
      .moveTo(LEFT, top + r * cellH)
      .lineTo(right, top + r * cellH)
      .stroke();
  }

  // Vérification : QR code vers la page publique, en bas de la page de garde.
  const registration = options.registration;
  if (registration) {
    const qrSize = 84;
    const boxH = qrSize + 32;
    const boxTop = top + rows * cellH + 28;
    doc.roundedRect(LEFT, boxTop, width, boxH, 4).fill(COLORS.paper);
    drawQr(
      doc,
      `${registration.verifyUrl}?document=${registration.documentId}`,
      LEFT + 16,
      boxTop + 16,
      qrSize,
    );
    const textX = LEFT + 16 + qrSize + 20;
    const textW = right - 16 - textX;
    doc
      .fillColor(INK)
      .font(F.medium)
      .fontSize(11)
      .text('Document signé et enregistré', textX, boxTop + 18, { width: textW });
    doc
      .fillColor(MUTED)
      .font(F.regular)
      .fontSize(9.5)
      .text(
        `Obsio a signé ce fichier électroniquement et enregistré son empreinte à l’émission. Pour vérifier qu’il n’a pas été modifié, scannez le QR code ou ouvrez ${registration.verifyUrl.replace(/^https?:\/\//, '')} et déposez-y le fichier PDF reçu.`,
        { width: textW, lineGap: 1.5 },
      );
    doc
      .fillColor(FAINT)
      .fontSize(8.5)
      .text(`Un PDF imprimé ou modifié ne peut pas être vérifié.`, { width: textW });
  }

  // ——— Sommaire ———
  doc.addPage();
  doc.fillColor(INK).font(F.title).fontSize(18).text('Sommaire des réserves', LEFT, LEFT);
  doc.moveDown(0.6);
  const cols = { n: LEFT, desc: LEFT + 30, plate: LEFT + 300, status: LEFT + 390 };
  const header = () => {
    const y = doc.y;
    doc.fillColor(FAINT).font(F.regular).fontSize(8);
    doc.text('N°', cols.n, y, { lineBreak: false });
    doc.text('Réserve', cols.desc, y, { lineBreak: false });
    doc.text('Repère', cols.plate, y, { lineBreak: false });
    doc.text('État', cols.status, y, { lineBreak: false });
    doc.y = y + 14;
    rule(doc.y, INK);
    doc.y += 1;
  };
  if (reserves.length === 0) {
    doc
      .fillColor(MUTED)
      .font(F.regular)
      .fontSize(11)
      .text('Aucune réserve ne correspond à ce périmètre.', LEFT, doc.y, { width });
  } else {
    header();
  }
  const rowH = 26;
  for (const [index, item] of reserves.entries()) {
    if (doc.y + rowH > bottom()) {
      doc.addPage();
      doc.y = LEFT;
      header();
    }
    const y = doc.y;
    doc
      .fillColor(FAINT)
      .font(F.plate)
      .fontSize(10)
      .text(String(index + 1), cols.n, y + 8, { lineBreak: false });
    doc
      .fillColor(INK)
      .font(F.regular)
      .fontSize(10)
      .text(item.description, cols.desc, y + 8, {
        width: cols.plate - cols.desc - 12,
        height: 13,
        ellipsis: true,
        lineBreak: false,
      });
    if (item.equipment) drawPlate(doc, item.equipment.name, cols.plate, y + 6, 80);
    const color = item.overdue ? COLORS.danger : STATUS_COLORS[item.status];
    doc.circle(cols.status + 3, y + 14, 3).fill(color);
    const at = item.status === 'levee' ? liftedAt(item.id) : null;
    const state =
      item.status === 'levee'
        ? at
          ? `Levée le ${day(new Date(at), 'short')}`
          : 'Levée'
        : item.overdue
          ? 'En retard'
          : RESERVE_STATUS_LABELS[item.status];
    doc
      .fillColor(INK)
      .font(F.regular)
      .fontSize(9.5)
      .text(state, cols.status + 10, y + 8.5, {
        width: right - cols.status - 10,
        lineBreak: false,
      });
    doc.y = y + rowH;
    rule(doc.y);
  }

  // ——— Réserves, une par une ———
  for (const [index, item] of reserves.entries()) {
    const detail = details.get(item.id);
    if (!detail) continue;
    if (index === 0) {
      doc.addPage();
      doc.y = LEFT;
    } else {
      ensure(170);
      doc.moveDown(1.6);
    }

    // En-tête : numéro et état sur une ligne, filet d'encre, puis la description.
    const headY = doc.y;
    doc
      .fillColor(FAINT)
      .font(F.plate)
      .fontSize(10)
      .text(`Réserve ${index + 1}`, LEFT, headY, { lineBreak: false });
    const color = item.overdue ? COLORS.danger : STATUS_COLORS[item.status];
    const label = statusLine(item, liftedAt(item.id));
    doc.font(F.medium).fontSize(10);
    const labelW = doc.widthOfString(label);
    doc.circle(right - labelW - 8, headY + 6.5, 3).fill(color);
    doc.fillColor(INK).text(label, right - labelW, headY, { lineBreak: false });
    rule(headY + 18, INK);
    doc.y = headY + 28;
    doc.fillColor(INK).font(F.medium).fontSize(13).text(item.description, LEFT, doc.y, { width });

    doc.font(F.regular).fontSize(9.5).moveDown(0.3);
    for (const source of detail.sources) {
      const visit = source.dateVisite ? `, visite du ${day(source.dateVisite)}` : '';
      doc
        .fillColor(MUTED)
        .text(
          `${DOCUMENT_TYPE_LABELS[source.documentType]}, observation n° ${source.reference} (${source.organisme}${visit}, page ${source.pageSource})`,
          { width },
        );
    }
    if (item.equipment) {
      ensure(20);
      const y = doc.y + 5;
      const plateW = drawPlate(doc, item.equipment.name, LEFT, y);
      doc
        .fillColor(INK)
        .font(F.regular)
        .fontSize(10)
        .text(
          `${item.equipment.buildingName}, ${item.equipment.floorName}`,
          LEFT + plateW + 6,
          y + 1.5,
          { width: width - plateW - 6 },
        );
      doc.x = LEFT;
      doc.y = Math.max(doc.y, y + 18);
    }
    if (item.preconisation) {
      doc.moveDown(0.2);
      doc
        .fillColor(INK)
        .font(F.regular)
        .fontSize(10)
        .text(`Préconisation : ${item.preconisation}`, LEFT, doc.y, { width });
    }

    // Historique : date, auteur, action ; ce qui prouve le traitement.
    const steps = detail.events
      .map((event) => ({ event, text: describeEvent(event) }))
      .filter((step): step is { event: ReserveEvent; text: string } => step.text !== null);
    if (steps.length > 0) {
      ensure(30);
      doc.moveDown(0.7);
      doc.fillColor(FAINT).font(F.regular).fontSize(8.5).text('Historique', LEFT, doc.y);
      doc.moveDown(0.2);
      for (const { event, text } of steps) {
        ensure(14);
        const y = doc.y;
        doc
          .fillColor(FAINT)
          .font(F.regular)
          .fontSize(9)
          .text(day(new Date(event.createdAt), 'short'), LEFT, y, {
            width: 72,
            lineBreak: false,
          });
        doc
          .fillColor(INK)
          .text(`${event.actor ?? 'Obsio'} ${text}`, LEFT + 76, y, { width: width - 76 });
        doc.y = Math.max(doc.y, y + 12) + 1;
      }
    }

    const own = proofs.filter((p) => p.reserveId === item.id);
    if (own.length === 0) {
      doc.moveDown(0.5);
      doc.fillColor(MUTED).font(F.regular).fontSize(9.5).text('Aucune preuve jointe.', LEFT, doc.y);
      continue;
    }
    for (const proof of own) {
      ensure(40);
      doc.moveDown(0.7);
      doc
        .fillColor(FAINT)
        .font(F.regular)
        .fontSize(8.5)
        .text(`Preuve de ${proof.author}, le ${day(new Date(proof.createdAt))}`, LEFT, doc.y);
      doc.fillColor(INK).fontSize(10);
      if (proof.comment) doc.text(proof.comment, { width });
      let x = LEFT;
      let rowTop: number | null = null;
      for (const key of proof.photoKeys) {
        const image = await storage.get(key);
        if (!image || !embeddable(image)) continue;
        if (rowTop === null || x + PHOTO_WIDTH > right) {
          if (rowTop !== null) doc.y = rowTop + PHOTO_HEIGHT + PHOTO_GAP;
          ensure(PHOTO_HEIGHT + PHOTO_GAP);
          rowTop = doc.y + 4;
          x = LEFT;
        }
        doc.image(image, x, rowTop, { fit: [PHOTO_WIDTH, PHOTO_HEIGHT] });
        x += PHOTO_WIDTH + PHOTO_GAP;
      }
      if (rowTop !== null) doc.y = rowTop + PHOTO_HEIGHT + 4;
      doc.x = LEFT;
    }
  }

  // Pied de page : site, numéro du document et page.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const y = doc.page.height - 35;
    doc.page.margins.bottom = 0;
    doc
      .fillColor(FAINT)
      .font(F.regular)
      .fontSize(8)
      .text(`${options.site.name} · dossier de preuves${number ? ` n° ${number}` : ''}`, LEFT, y, {
        lineBreak: false,
      })
      .text(`Page ${i + 1} sur ${range.count}`, LEFT, y, {
        width,
        align: 'right',
        lineBreak: false,
      });
  }
  doc.end();
  return { pdf: await done, reserveCount: reserves.length, liftedCount: lifted };
}
