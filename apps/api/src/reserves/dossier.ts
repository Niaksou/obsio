import {
  DOCUMENT_TYPE_LABELS,
  RESERVE_STATUS_LABELS,
  type DocumentType,
  type ReserveListItem,
} from '@obsio/shared';
import PDFDocument from 'pdfkit';
import type { Transaction } from '../db/client.js';
import type { Storage } from '../storage.js';
import { listReserves, reserveDetail, reserveProofs } from './queries.js';

// Dossier de preuves d'un site, en PDF : pour chaque réserve, d'où elle vient, ce qui a été fait
// et les photos. Filtrable par origine (dossier pour l'assureur avec le Q18, ou réglementaire).

const INK = '#18222c';
const MUTED = '#56626c';
const LINE = '#c8d0cd';
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
  if (item.status === 'levee' && closed) {
    return `Levée le ${day(new Date(closed.at))}${closed.by ? ` par ${closed.by}` : ''}`;
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

  // Page de garde
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(22).text('Dossier de preuves');
  doc.moveDown(0.3).font('Helvetica').fontSize(14).text(options.site.name);
  if (options.site.address) doc.fillColor(MUTED).fontSize(11).text(options.site.address);
  doc.moveDown();
  doc.fillColor(INK).fontSize(11);
  doc.text(`Organisation : ${options.organisationName}`);
  doc.text(`Établi le ${day(new Date())}`);
  doc.text(
    `Origine : ${options.documentType ? DOCUMENT_TYPE_LABELS[options.documentType] : 'tous les rapports'}`,
  );
  doc.text(
    `Périmètre : ${options.scope === 'levees' ? 'réserves levées' : 'toutes les réserves, avec leur état'}`,
  );
  doc.moveDown();
  const count = (status: ReserveListItem['status']) =>
    reserves.filter((r) => r.status === status).length;
  doc.text(
    `${reserves.length} réserve${reserves.length > 1 ? 's' : ''} : ${count('levee')} levée(s), ${count('corrigee')} corrigée(s) à vérifier, ${count('ouverte') + count('assignee')} en cours.`,
  );
  if (reserves.length === 0) {
    doc.moveDown().fillColor(MUTED).text('Aucune réserve ne correspond à ce périmètre.');
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
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text(`Réserve ${index + 1}`);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(item.description, { width });
    doc.font('Helvetica').fontSize(10).moveDown(0.3);
    for (const source of detail.sources) {
      const visit = source.dateVisite ? `, visite du ${day(source.dateVisite)}` : '';
      doc.text(
        `${DOCUMENT_TYPE_LABELS[source.documentType]}, observation n° ${source.reference} (${source.organisme}${visit}, page ${source.pageSource})`,
        { width },
      );
    }
    if (item.equipment) {
      doc.text(
        `Équipement : ${item.equipment.name}, ${item.equipment.buildingName}, ${item.equipment.floorName}`,
      );
    }
    if (item.preconisation) doc.text(`Préconisation : ${item.preconisation}`, { width });
    doc.font('Helvetica-Bold').text(statusLine(item, closed)).font('Helvetica');

    const own = proofs.filter((p) => p.reserveId === item.id);
    if (own.length === 0) {
      doc.fillColor(MUTED).text('Aucune preuve jointe.').fillColor(INK);
      continue;
    }
    for (const proof of own) {
      ensure(40);
      doc.moveDown(0.5);
      doc
        .fillColor(MUTED)
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
      .fillColor(MUTED)
      .fontSize(8)
      .text(`${options.site.name}, dossier de preuves`, 50, y, { lineBreak: false })
      .text(`Page ${i + 1} sur ${range.count}`, 50, y, { width, align: 'right', lineBreak: false });
  }
  doc.end();
  return done;
}
