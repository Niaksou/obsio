import {
  DOCUMENT_TYPE_LABELS,
  RESERVE_STATUS_LABELS,
  type DocumentType,
  type ReserveListItem,
} from '@obsio/shared';
import PDFDocument from 'pdfkit';
import { COLORS, FONTS, LOGO } from '../brand.js';
import type { Transaction } from '../db/client.js';
import type { Storage } from '../storage.js';
import { listReserves, reserveDetail, reserveProofs } from './queries.js';

// Dossier de preuves d'un site, en PDF : pour chaque réserve, d'où elle vient, ce qui a été fait
// et les photos. Filtrable par origine (dossier pour l'assureur avec le Q18, ou réglementaire).

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
const PHOTO_WIDTH = 150;
const PHOTO_HEIGHT = 112;
const PHOTO_GAP = 10;

export interface DossierOptions {
  organisationName: string;
  site: { id: string; name: string; address: string | null };
  documentType?: DocumentType;
  scope: 'levees' | 'toutes';
}

function day(value: string | Date) {
  const date = typeof value === 'string' ? new Date(`${value}T12:00:00`) : value;
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}

function statusLine(
  item: ReserveListItem,
  closed: { at: string; by: string | null } | null,
): string {
  if (item.status === 'levee') {
    return closed
      ? `Levée le ${day(new Date(closed.at))}${closed.by ? ` par ${closed.by}` : ''}`
      : 'Levée';
  }
  const label = RESERVE_STATUS_LABELS[item.status];
  if (item.status === 'ouverte' || item.status === 'assignee') {
    return `${label}${item.dueDate ? `, échéance le ${day(item.dueDate)}` : ''}${item.overdue ? ' (en retard)' : ''}`;
  }
  return `${label}, en attente de vérification`;
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
function drawPlate(doc: Doc, label: string, x: number, y: number) {
  doc.font(F.plate).fontSize(9);
  const w = doc.widthOfString(label) + 10;
  doc.roundedRect(x, y, w, 14, 2).fill(INK);
  doc.fillColor('#ffffff').text(label, x + 5, y + 2.2, { lineBreak: false });
  return w;
}

/** Pastille de statut suivie de son libellé, sur la ligne courante. */
function statusText(doc: Doc, color: string, label: string, width: number) {
  const y = doc.y;
  doc.circle(53, y + 6.5, 3).fill(color);
  doc
    .fillColor(INK)
    .font(F.medium)
    .fontSize(10)
    .text(label, 62, y, { width: width - 12 });
  doc.x = 50;
}

export async function buildProofDossier(
  tx: Transaction,
  storage: Storage,
  options: DossierOptions,
): Promise<Buffer> {
  const all = await listReserves(tx, options.site.id, {
    ...(options.documentType ? { documentType: options.documentType } : {}),
  });
  const reserves = options.scope === 'levees' ? all.filter((r) => r.status === 'levee') : all;
  const proofs = await reserveProofs(
    tx,
    storage,
    reserves.map((r) => r.id),
  );

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    bufferPages: true,
    info: {
      Title: `Dossier de preuves, ${options.site.name}`,
      Author: options.organisationName,
      Creator: 'Obsio',
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
  const width = doc.page.width - 100;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (height: number) => {
    if (doc.y + height > bottom()) doc.addPage();
  };

  // Page de garde : logo et titre du document, filet d'encre, site, cartouche, compteurs.
  drawLogo(doc, 50, 50, 20);
  doc
    .fillColor(FAINT)
    .font(F.regular)
    .fontSize(9)
    .text('Dossier de preuves', 50, 56, { width, align: 'right' });
  doc
    .moveTo(50, 84)
    .lineTo(50 + width, 84)
    .lineWidth(1.5)
    .strokeColor(INK)
    .stroke()
    .lineWidth(1);
  doc.y = 108;
  doc.fillColor(INK).font(F.title).fontSize(28).text(options.site.name, { width });
  if (options.site.address) {
    doc.fillColor(MUTED).font(F.regular).fontSize(11).text(options.site.address, { width });
  }

  // Cartouche : les faits du dossier rangés en cases, comme le bloc-titre d'un plan.
  const facts: [string, string][] = [
    ['Organisation', options.organisationName],
    ['Établi le', day(new Date())],
    [
      'Origine',
      options.documentType ? DOCUMENT_TYPE_LABELS[options.documentType] : 'Tous les rapports',
    ],
    ['Périmètre', options.scope === 'levees' ? 'Réserves levées' : 'Toutes les réserves'],
  ];
  const cellW = width / 2;
  const cellH = 38;
  const top = doc.y + 20;
  facts.forEach(([label, value], i) => {
    const cx = 50 + (i % 2) * cellW;
    const cy = top + Math.floor(i / 2) * cellH;
    doc
      .fillColor(FAINT)
      .font(F.regular)
      .fontSize(8)
      .text(label, cx + 10, cy + 6, { lineBreak: false });
    doc
      .fillColor(INK)
      .font(F.plate)
      .fontSize(12)
      .text(value, cx + 10, cy + 17, {
        width: cellW - 20,
        height: 16,
        ellipsis: true,
        lineBreak: false,
      });
  });
  const rows = Math.ceil(facts.length / 2);
  doc
    .strokeColor(INK)
    .rect(50, top, width, rows * cellH)
    .stroke();
  doc
    .moveTo(50 + cellW, top)
    .lineTo(50 + cellW, top + rows * cellH)
    .stroke();
  for (let r = 1; r < rows; r += 1) {
    doc
      .moveTo(50, top + r * cellH)
      .lineTo(50 + width, top + r * cellH)
      .stroke();
  }

  // Compteurs : un chiffre par état, chacun avec sa pastille.
  const count = (status: ReserveListItem['status']) =>
    reserves.filter((r) => r.status === status).length;
  const figures: [number, string, string | null][] = [
    [reserves.length, reserves.length > 1 ? 'réserves' : 'réserve', null],
    [count('ouverte') + count('assignee'), 'en cours', COLORS.danger],
    [count('corrigee'), 'corrigées, à vérifier', COLORS.pending],
    [count('levee'), count('levee') > 1 ? 'levées' : 'levée', COLORS.patina],
  ];
  const figTop = top + rows * cellH + 24;
  const figW = width / figures.length;
  figures.forEach(([value, label, color], i) => {
    const fx = 50 + i * figW;
    doc
      .fillColor(INK)
      .font(F.title)
      .fontSize(26)
      .text(String(value), fx, figTop, { lineBreak: false });
    if (color) doc.circle(fx + 3, figTop + 39, 3).fill(color);
    doc
      .fillColor(MUTED)
      .font(F.regular)
      .fontSize(9)
      .text(label, fx + (color ? 10 : 0), figTop + 34, { width: figW - 12, lineBreak: false });
  });
  doc.x = 50;
  doc.y = figTop + 56;
  if (reserves.length === 0) {
    doc
      .fillColor(MUTED)
      .font(F.regular)
      .fontSize(11)
      .text('Aucune réserve ne correspond à ce périmètre.');
  }

  for (const [index, item] of reserves.entries()) {
    const detail = await reserveDetail(tx, storage, item.id);
    if (!detail) continue;
    const lifted = [...detail.events].reverse().find((e) => e.type === 'levee');
    const closed = lifted ? { at: lifted.createdAt, by: lifted.actor } : null;

    ensure(140);
    doc.moveDown(1.2);
    doc
      .strokeColor(LINE)
      .moveTo(50, doc.y)
      .lineTo(50 + width, doc.y)
      .stroke();
    doc.moveDown(0.6);
    doc
      .fillColor(FAINT)
      .font(F.regular)
      .fontSize(9)
      .text(`Réserve ${index + 1}`);
    doc.moveDown(0.1);
    doc.fillColor(INK).font(F.medium).fontSize(12.5).text(item.description, { width });
    doc.font(F.regular).fontSize(10).moveDown(0.3);
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
      const y = doc.y + 3;
      const plateW = drawPlate(doc, item.equipment.name, 50, y);
      doc
        .fillColor(INK)
        .font(F.regular)
        .fontSize(10)
        .text(
          `${item.equipment.buildingName}, ${item.equipment.floorName}`,
          50 + plateW + 6,
          y + 1.5,
          {
            width: width - plateW - 6,
          },
        );
      doc.x = 50;
      doc.y = Math.max(doc.y, y + 18);
    }
    if (item.preconisation) {
      doc
        .fillColor(INK)
        .font(F.regular)
        .fontSize(10)
        .text(`Préconisation : ${item.preconisation}`, { width });
    }
    doc.moveDown(0.3);
    statusText(
      doc,
      item.overdue ? COLORS.danger : STATUS_COLORS[item.status],
      statusLine(item, closed),
      width,
    );
    doc.font(F.regular);

    const own = proofs.filter((p) => p.reserveId === item.id);
    if (own.length === 0) {
      doc
        .fillColor(MUTED)
        .font(F.regular)
        .fontSize(10)
        .text('Aucune preuve jointe.')
        .fillColor(INK);
      continue;
    }
    for (const proof of own) {
      ensure(40);
      doc.moveDown(0.5);
      doc
        .fillColor(FAINT)
        .font(F.regular)
        .fontSize(9)
        .text(`Preuve de ${proof.author}, le ${day(new Date(proof.createdAt))}`);
      doc.fillColor(INK).fontSize(10);
      if (proof.comment) doc.text(proof.comment, { width });
      let x = 50;
      let rowTop: number | null = null;
      for (const key of proof.photoKeys) {
        const image = await storage.get(key);
        if (!image || !embeddable(image)) continue;
        if (rowTop === null || x + PHOTO_WIDTH > 50 + width) {
          if (rowTop !== null) doc.y = rowTop + PHOTO_HEIGHT + PHOTO_GAP;
          ensure(PHOTO_HEIGHT + PHOTO_GAP);
          rowTop = doc.y + 4;
          x = 50;
        }
        doc.image(image, x, rowTop, { fit: [PHOTO_WIDTH, PHOTO_HEIGHT] });
        x += PHOTO_WIDTH + PHOTO_GAP;
      }
      if (rowTop !== null) doc.y = rowTop + PHOTO_HEIGHT + 4;
      doc.x = 50;
    }
  }

  // Pied de page : site et numéro de page.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const y = doc.page.height - 35;
    doc.page.margins.bottom = 0;
    doc
      .fillColor(FAINT)
      .font(F.regular)
      .fontSize(8)
      .text(`${options.site.name}, dossier de preuves`, 50, y, { lineBreak: false })
      .text(`Page ${i + 1} sur ${range.count}`, 50, y, { width, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
