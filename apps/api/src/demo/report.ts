import {
  DOCUMENT_TYPE_LABELS,
  Q18_CONSTATATIONS,
  type ExtractionOutcome,
  type ProviderReport,
} from '@obsio/shared';
import PDFDocument from 'pdfkit';
import type { DemoReport } from './content.js';

// Rapport de démonstration : un PDF lisible (page de garde, puis les observations, quatre par
// page) et la sortie d'extraction qui lui correspond, pages comprises. Aucun modèle n'est appelé.

const PER_PAGE = 4;

const Q18_STATES: Record<string, string> = {
  absence_danger: 'Absence de danger',
  danger_nouveau: 'Danger signalé pour la première fois',
  danger_deja_signale: 'Danger déjà signalé',
  sans_objet: 'Sans objet',
  non_verifie: 'Non vérifié',
};

/** Sortie d'extraction du rapport, avec la page de chaque observation dans le PDF. */
export function demoExtraction(report: DemoReport, site: { name: string; address: string }) {
  let page = 1; // page de garde
  const providerReport: ProviderReport = {
    documents: report.documents.map((document) => {
      page += 1; // page d'en-tête du document
      const first = page + 1;
      page += Math.ceil(document.reserves.length / PER_PAGE);
      return {
        type: document.type,
        organisme: document.organisme,
        numeroRapport: document.numeroRapport,
        dateVisite: document.dateVisite,
        site: { nom: site.name, adresse: site.address },
        q18: document.q18 ?? null,
        q19: document.q19 ?? null,
        reserves: document.reserves.map((r, index) => ({
          reference: r.reference,
          codeObservation: r.codeObservation ?? null,
          description: r.description,
          preconisation: r.preconisation ?? null,
          articleReglementaire: r.article ?? null,
          localisationTexte: r.localisation ?? null,
          gravite: r.gravite ?? null,
          nouvelleOuReconduite: r.reconduite ? 'reconduite' : 'nouvelle',
          pageSource: first + Math.floor(index / PER_PAGE),
          constatationQ18: r.constatationQ18 ?? null,
          thermique: r.thermique
            ? {
                ...r.thermique,
                ecart:
                  Math.round(
                    (r.thermique.temperatureDefaut - r.thermique.temperatureReference) * 10,
                  ) / 10,
              }
            : null,
          confiance: r.confiance ?? 0.95,
        })),
      };
    }),
  };
  const outcome: ExtractionOutcome = {
    status: 'success',
    finishedAt: new Date().toISOString(),
    report: providerReport,
    trace: {
      provider: 'demonstration',
      ocrModel: 'demonstration',
      extractionModel: 'demonstration',
      promptVersion: 'demonstration',
      attempts: 1,
      rawOutput: JSON.stringify(providerReport),
      usage: { ocrPages: 0, promptTokens: 0, completionTokens: 0 },
    },
  };
  return outcome;
}

function day(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** PDF du rapport, dont la mise en page suit les pages annoncées par demoExtraction. */
export function demoReportPdf(
  report: DemoReport,
  site: { name: string; address: string },
): Promise<Buffer> {
  const pdf = new PDFDocument({ size: 'A4', margin: 56, info: { Title: report.fileName } });
  const chunks: Buffer[] = [];
  pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) =>
    pdf.on('end', () => resolve(Buffer.concat(chunks))),
  );

  const [firstDocument] = report.documents;
  pdf.fontSize(10).fillColor('#56626c').text('DOCUMENT DE DÉMONSTRATION : données fictives');
  pdf
    .moveDown(4)
    .fontSize(22)
    .fillColor('#18222c')
    .text(report.fileName.replace(/\.pdf$/, ''));
  pdf.moveDown().fontSize(12).text(site.name).text(site.address);
  pdf.moveDown().text(`Organisme : ${firstDocument!.organisme}`);
  pdf.text(`Visite du ${day(firstDocument!.dateVisite)}`);
  pdf.moveDown().text('Documents :');
  for (const document of report.documents) {
    pdf.text(`• ${DOCUMENT_TYPE_LABELS[document.type]} n° ${document.numeroRapport}`);
  }

  for (const document of report.documents) {
    pdf.addPage();
    pdf.fontSize(16).fillColor('#18222c').text(DOCUMENT_TYPE_LABELS[document.type]);
    pdf.moveDown(0.5).fontSize(10).fillColor('#56626c');
    pdf.text(
      `${document.organisme}, rapport n° ${document.numeroRapport}, visite du ${day(document.dateVisite)}`,
    );
    pdf.moveDown().fillColor('#18222c');
    if (document.q18) {
      pdf.fontSize(12).text('Constatations');
      pdf.moveDown(0.5).fontSize(9);
      for (const c of document.q18.constatations) {
        pdf.text(`${c.numero}. ${Q18_CONSTATATIONS[c.numero]} : ${Q18_STATES[c.etat]}`);
        pdf.moveDown(0.3);
      }
      pdf
        .moveDown()
        .fontSize(10)
        .text(
          document.q18.conclusion === 'risque'
            ? 'Conclusion : l’installation peut entraîner des risques d’incendie ou d’explosion.'
            : 'Conclusion : l’installation ne présente pas de risque d’incendie ou d’explosion.',
        );
    } else if (document.q19) {
      pdf.fontSize(12).text('Synthèse des anomalies thermiques');
      pdf.moveDown(0.5).fontSize(10);
      pdf.text(`Priorité 1 : ${document.q19.anomaliesPriorite1 ?? 0}`);
      pdf.text(`Priorité 2 : ${document.q19.anomaliesPriorite2 ?? 0}`);
      pdf.text(`Priorité 3 : ${document.q19.anomaliesPriorite3 ?? 0}`);
    } else {
      pdf
        .fontSize(10)
        .text(`${document.reserves.length} observations relevées, détaillées pages suivantes.`);
    }

    document.reserves.forEach((r, index) => {
      if (index % PER_PAGE === 0) {
        pdf.addPage();
        pdf.fontSize(12).fillColor('#18222c').text('Observations');
        pdf.moveDown();
      }
      pdf
        .fontSize(11)
        .fillColor('#18222c')
        .text(`Observation ${r.reference}${r.codeObservation ? ` (${r.codeObservation})` : ''}`);
      pdf.fontSize(10).text(r.description);
      pdf.fillColor('#56626c').fontSize(9);
      if (r.localisation) pdf.text(`Localisation : ${r.localisation}`);
      if (r.preconisation) pdf.text(`Préconisation : ${r.preconisation}`);
      if (r.article) pdf.text(`Référence : ${r.article}`);
      if (r.gravite) pdf.text(`Gravité : ${r.gravite}`);
      if (r.thermique) {
        pdf.text(
          `Température : ${r.thermique.temperatureDefaut} °C (référence ${r.thermique.temperatureReference} °C)`,
        );
      }
      if (r.reconduite) pdf.text('Observation déjà signalée lors de la visite précédente.');
      pdf.moveDown(1.2);
    });
  }
  pdf.end();
  return done;
}
