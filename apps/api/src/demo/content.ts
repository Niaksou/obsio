import {
  addMonths,
  type DocumentType,
  type EquipmentType,
  type Q18Summary,
  type Q19Summary,
} from '@obsio/shared';
import type { PlanDrawing } from './images.js';

// Contenu de la démonstration : fictif de bout en bout (organismes, personnes, sites). Les dates
// sont relatives au jour du lancement, pour que les échéances et retards restent parlants.

export interface DemoEquipment {
  name: string;
  type: EquipmentType;
  aliases?: string[];
  at: [x: number, y: number];
}

export interface DemoFloor {
  name: string;
  level: number;
  plan: PlanDrawing & { metresPerPixel: number };
  equipment: DemoEquipment[];
}

export interface DemoSite {
  name: string;
  address: string;
  buildings: { name: string; floors: DemoFloor[] }[];
}

export interface DemoReserve {
  reference: string;
  codeObservation?: string;
  description: string;
  preconisation?: string;
  article?: string;
  localisation?: string;
  gravite?: string;
  reconduite?: boolean;
  constatationQ18?: number;
  thermique?: { temperatureDefaut: number; temperatureReference: number };
  confiance?: number;
}

export interface DemoDocument {
  type: DocumentType;
  organisme: string;
  numeroRapport: string;
  dateVisite: string;
  q18?: Q18Summary;
  q19?: Q19Summary;
  reserves: DemoReserve[];
}

export interface DemoReport {
  fileName: string;
  documents: DemoDocument[];
}

/** Jour (AAAA-MM-JJ) décalé de `days` jours par rapport à `on`. */
export function shift(on: string, days: number): string {
  const date = new Date(`${on}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const ORGANISME = 'CERA Inspection (démonstration)';
export const THERMOGRAPHE = 'ThermoVision Contrôle (démonstration)';

export const CONTRACTORS = [
  { name: 'Karim Benali', company: 'Élec Rhône Services', email: 'karim.benali@example.com' },
  { name: 'Sophie Martin', company: 'SM Électricité', email: 'sophie.martin@example.com' },
] as const;

export const LYON: DemoSite = {
  name: 'Usine de Lyon',
  address: '12 rue des Forges, 69007 Lyon',
  buildings: [
    {
      name: 'Atelier',
      floors: [
        {
          name: 'Rez-de-chaussée',
          level: 0,
          plan: {
            width: 1600,
            height: 1000,
            metresPerPixel: 0.05,
            rooms: [
              [0.62, 0.015, 0.14, 0.25],
              [0.76, 0.015, 0.225, 0.25],
              [0.62, 0.265, 0.365, 0.35],
              [0.62, 0.615, 0.18, 0.37],
              [0.8, 0.615, 0.185, 0.37],
            ],
            doors: [
              [0.615, 0.12, 0.012, 0.07],
              [0.615, 0.4, 0.012, 0.09],
              [0.615, 0.75, 0.012, 0.07],
              [0.795, 0.75, 0.012, 0.07],
              [0.85, 0.01, 0.08, 0.02],
            ],
            blocks: [
              [0.08, 0.15, 0.1, 0.14],
              [0.08, 0.4, 0.1, 0.14],
              [0.3, 0.15, 0.12, 0.1],
              [0.3, 0.35, 0.12, 0.1],
              [0.3, 0.62, 0.25, 0.05],
              [0.3, 0.75, 0.25, 0.05],
              [0.65, 0.32, 0.3, 0.04],
              [0.65, 0.42, 0.3, 0.04],
              [0.65, 0.52, 0.3, 0.04],
              [0.85, 0.72, 0.08, 0.12],
            ],
          },
          equipment: [
            { name: 'TGBT', type: 'tgbt', aliases: ['tableau général'], at: [0.69, 0.12] },
            { name: 'TD1', type: 'td', aliases: ['tableau atelier'], at: [0.25, 0.08] },
            { name: 'TD2', type: 'td', aliases: ['tableau soudure'], at: [0.5, 0.55] },
            { name: 'Presse 3', type: 'machine', at: [0.13, 0.22] },
            { name: 'Presse 4', type: 'machine', at: [0.13, 0.47] },
            { name: 'Tour CN 2', type: 'machine', at: [0.36, 0.2] },
            { name: 'Compresseur', type: 'machine', at: [0.89, 0.78] },
            { name: 'BAES quai B', type: 'eclairage_securite', at: [0.87, 0.22] },
          ],
        },
        {
          name: 'Mezzanine',
          level: 1,
          plan: {
            width: 1600,
            height: 600,
            metresPerPixel: 0.05,
            rooms: [
              [0.03, 0.05, 0.2, 0.5],
              [0.23, 0.05, 0.3, 0.5],
              [0.53, 0.05, 0.44, 0.9],
            ],
            doors: [
              [0.13, 0.54, 0.05, 0.03],
              [0.35, 0.54, 0.05, 0.03],
              [0.525, 0.7, 0.012, 0.12],
            ],
            blocks: [
              [0.05, 0.1, 0.06, 0.3],
              [0.6, 0.2, 0.3, 0.06],
              [0.6, 0.4, 0.3, 0.06],
              [0.6, 0.6, 0.3, 0.06],
            ],
            stairs: [[0.05, 0.65, 0.15, 0.25]],
          },
          equipment: [
            { name: 'TD3 mezzanine', type: 'td', at: [0.4, 0.75] },
            { name: 'Onduleur salle serveur', type: 'onduleur', at: [0.15, 0.3] },
            { name: 'Armoire climatisation', type: 'armoire', at: [0.8, 0.85] },
          ],
        },
      ],
    },
    {
      name: 'Bureaux',
      floors: [
        {
          name: 'Rez-de-chaussée',
          level: 0,
          plan: {
            width: 1200,
            height: 800,
            metresPerPixel: 0.025,
            rooms: [
              [0.03, 0.03, 0.35, 0.45],
              [0.38, 0.03, 0.59, 0.45],
              [0.03, 0.48, 0.3, 0.49],
              [0.33, 0.48, 0.4, 0.49],
              [0.73, 0.48, 0.24, 0.49],
            ],
            doors: [
              [0.15, 0.475, 0.06, 0.015],
              [0.5, 0.475, 0.06, 0.015],
              [0.8, 0.475, 0.06, 0.015],
              [0.375, 0.2, 0.01, 0.08],
              [0.02, 0.2, 0.02, 0.08],
            ],
            blocks: [
              [0.45, 0.1, 0.12, 0.08],
              [0.65, 0.1, 0.12, 0.08],
              [0.45, 0.28, 0.12, 0.08],
              [0.65, 0.28, 0.12, 0.08],
              [0.42, 0.62, 0.22, 0.18],
              [0.05, 0.85, 0.25, 0.08],
            ],
          },
          equipment: [
            { name: 'TD Bureaux', type: 'td', at: [0.85, 0.7] },
            { name: 'BAES accueil', type: 'eclairage_securite', at: [0.2, 0.1] },
            { name: 'Coffret cuisine', type: 'coffret', at: [0.12, 0.75] },
            { name: 'Borne VE parking', type: 'borne_recharge', at: [0.06, 0.32] },
          ],
        },
      ],
    },
  ],
};

export const VILLEFRANCHE: DemoSite = {
  name: 'Entrepôt de Villefranche',
  address: 'ZI Nord, 69400 Villefranche-sur-Saône',
  buildings: [
    {
      name: 'Entrepôt',
      floors: [
        {
          name: 'Rez-de-chaussée',
          level: 0,
          plan: {
            width: 1600,
            height: 900,
            metresPerPixel: 0.0625,
            rooms: [
              [0.765, 0.015, 0.22, 0.6],
              [0.765, 0.615, 0.22, 0.37],
            ],
            doors: [
              [0.76, 0.3, 0.012, 0.1],
              [0.85, 0.61, 0.05, 0.015],
              [0.98, 0.1, 0.02, 0.1],
              [0.98, 0.3, 0.02, 0.1],
            ],
            blocks: [0, 1, 2, 3, 4, 5].map((i) => [0.08 + 0.1 * i, 0.1, 0.04, 0.7]),
          },
          equipment: [
            { name: 'TGBT Entrepôt', type: 'tgbt', at: [0.85, 0.85] },
            { name: 'TD Quais', type: 'td', at: [0.87, 0.3] },
            { name: 'Chargeur chariots', type: 'autre', at: [0.7, 0.88] },
            { name: 'BAES allée 3', type: 'eclairage_securite', at: [0.33, 0.5] },
          ],
        },
      ],
    },
  ],
};

/** Rapport de l'an dernier, à Lyon : trois réserves seront levées, deux reconduites. */
export function lyonLastYear(on: string): DemoReport {
  const visit = addMonths(on, -20);
  return {
    fileName: `Vérification électrique ${visit.slice(0, 4)} - Usine de Lyon.pdf`,
    documents: [
      {
        type: 'periodique',
        organisme: ORGANISME,
        numeroRapport: `CERA-${visit.replaceAll('-', '')}`,
        dateVisite: visit,
        reserves: [
          {
            reference: '1',
            codeObservation: 'CERA/LYO/001',
            description: 'Absence de repérage des départs sur le TGBT.',
            preconisation: 'Repérer l’ensemble des circuits de manière durable.',
            article: 'NF C 15-100 art. 514.1',
            localisation: 'TGBT, local électrique',
          },
          {
            reference: '2',
            codeObservation: 'CERA/LYO/002',
            description:
              'Dispositif différentiel 30 mA du circuit prises de l’atelier inopérant au test.',
            preconisation: 'Remplacer le dispositif différentiel.',
            article: 'R.4226-14',
            localisation: 'TD1 atelier, départ 4',
            gravite: 'Danger grave',
          },
          {
            reference: '3',
            codeObservation: 'CERA/LYO/003',
            description: 'Arrêt d’urgence de la Presse 3 sans repérage.',
            preconisation: 'Identifier l’organe d’arrêt d’urgence.',
            article: 'R.4324-14',
            localisation: 'Presse 3',
          },
          {
            reference: '4',
            codeObservation: 'CERA/LYO/004',
            description:
              'Bloc autonome d’éclairage de sécurité hors service près de la sortie du quai B.',
            preconisation: 'Remplacer le bloc autonome.',
            article: 'R.4227-14',
            localisation: 'BAES quai B',
          },
          {
            reference: '5',
            codeObservation: 'CERA/LYO/005',
            description: 'Câble d’alimentation du compresseur sans protection mécanique.',
            preconisation: 'Protéger le câble par un fourreau ou une goulotte.',
            article: 'NF C 15-100 art. 522.6',
            localisation: 'Compresseur, local technique',
          },
        ],
      },
    ],
  };
}

/** Rapport de cette année à Lyon : Code du travail et Q18 dans le même fichier. */
export function lyonThisYear(on: string): DemoReport {
  const visit = addMonths(on, -8);
  const code = (n: number) => `CERA/LYO/${String(n).padStart(3, '0')}`;
  return {
    fileName: `Vérification électrique et Q18 ${visit.slice(0, 4)} - Usine de Lyon.pdf`,
    documents: [
      {
        type: 'periodique',
        organisme: ORGANISME,
        numeroRapport: `CERA-${visit.replaceAll('-', '')}`,
        dateVisite: visit,
        reserves: [
          {
            reference: '1',
            codeObservation: code(2),
            description:
              'Dispositif différentiel 30 mA du circuit prises de l’atelier ne déclenchant pas au test.',
            preconisation: 'Remplacer le dispositif différentiel.',
            article: 'R.4226-14',
            localisation: 'TD1 atelier, départ 4',
            gravite: 'Danger grave',
            reconduite: true,
          },
          {
            reference: '2',
            codeObservation: code(5),
            description: 'Câble d’alimentation du compresseur sans protection mécanique.',
            preconisation: 'Protéger le câble par un fourreau ou une goulotte.',
            article: 'NF C 15-100 art. 522.6',
            localisation: 'Compresseur, local technique',
            reconduite: true,
          },
          {
            reference: '3',
            codeObservation: code(6),
            description: 'Présence importante de poussière dans le TGBT.',
            preconisation: 'Dépoussiérer l’armoire et vérifier son étanchéité.',
            article: 'R.4226-7',
            localisation: 'TGBT, local électrique',
          },
          {
            reference: '4',
            codeObservation: code(7),
            description: 'Échauffement anormal sur le bornier du départ soudure du TD2.',
            preconisation: 'Resserrer les connexions et contrôler le départ.',
            article: 'R.4226-7',
            localisation: 'TD2, départ soudure',
            gravite: 'Danger grave',
          },
          {
            reference: '5',
            codeObservation: code(8),
            description:
              'Absence de continuité du conducteur de protection sur la carcasse du Tour CN 2.',
            preconisation: 'Rétablir la liaison à la terre de la machine.',
            article: 'R.4215-3',
            localisation: 'Tour CN 2',
            gravite: 'Danger grave',
          },
          {
            reference: '6',
            codeObservation: code(9),
            description: 'Porte de l’armoire ne fermant pas à clé : parties actives accessibles.',
            preconisation: 'Réparer la serrure de l’armoire.',
            article: 'R.4226-10',
            localisation: 'TD3 mezzanine',
          },
          {
            reference: '7',
            codeObservation: code(10),
            description: 'Notice et schéma de l’onduleur absents.',
            preconisation: 'Mettre à disposition la notice et le schéma.',
            article: 'R.4226-12',
            localisation: 'Onduleur salle serveur',
          },
          {
            reference: '8',
            codeObservation: code(11),
            description: 'Indice de protection insuffisant pour une installation en extérieur.',
            preconisation: 'Remplacer l’enveloppe par un modèle IP 54 au minimum.',
            article: 'NF C 15-100 art. 512.2',
            localisation: 'Armoire climatisation, toiture',
          },
          {
            reference: '9',
            codeObservation: code(12),
            description:
              'Calibre du disjoncteur du circuit cuisine supérieur à ce que permet la section des conducteurs.',
            preconisation: 'Adapter le calibre du disjoncteur à la section.',
            article: 'NF C 15-100 art. 433',
            localisation: 'TD Bureaux, départ cuisine',
          },
          {
            reference: '10',
            codeObservation: code(13),
            description: 'Autonomie de l’éclairage de sécurité inférieure à une heure.',
            preconisation: 'Remplacer les batteries des blocs autonomes.',
            article: 'R.4227-14',
            localisation: 'BAES accueil',
          },
          {
            reference: '11',
            codeObservation: code(14),
            description: 'Prise de courant sans obturateur.',
            preconisation: 'Remplacer la prise par un modèle à obturateurs.',
            article: 'NF C 15-100 art. 559',
            localisation: 'Coffret cuisine',
          },
          {
            reference: '12',
            codeObservation: code(15),
            description: 'Câble souple endommagé à l’entrée de la machine.',
            preconisation: 'Remplacer le câble et son presse-étoupe.',
            article: 'R.4226-7',
            localisation: 'Presse 4',
          },
          {
            reference: '13',
            codeObservation: code(16),
            description: 'Absence de dispositif de coupure d’urgence pour la borne de recharge.',
            preconisation: 'Installer un arrêt d’urgence à proximité de la borne.',
            article: 'NF C 15-100 art. 722',
            localisation: 'Borne VE parking',
          },
          {
            reference: '14',
            codeObservation: code(17),
            description: 'Registre de sécurité incomplet : rapports précédents non annexés.',
            preconisation: 'Compléter le registre.',
            article: 'R.4226-19',
          },
        ],
      },
      {
        type: 'q18',
        organisme: ORGANISME,
        numeroRapport: `Q18-${visit.replaceAll('-', '')}`,
        dateVisite: visit,
        q18: {
          constatations: [
            { numero: 1, etat: 'danger_nouveau' },
            { numero: 2, etat: 'sans_objet' },
            { numero: 3, etat: 'absence_danger' },
            { numero: 4, etat: 'danger_deja_signale' },
            { numero: 5, etat: 'danger_nouveau' },
            { numero: 6, etat: 'absence_danger' },
            { numero: 7, etat: 'absence_danger' },
            { numero: 8, etat: 'sans_objet' },
          ],
          conclusion: 'risque',
        },
        reserves: [
          {
            reference: 'Q18-1',
            description: 'Échauffement anormal sur le bornier du départ soudure du TD2.',
            localisation: 'TD2, départ soudure',
            constatationQ18: 1,
          },
          {
            reference: 'Q18-2',
            description:
              'Dispositif différentiel 30 mA du circuit prises de l’atelier ne déclenchant pas au test.',
            localisation: 'TD1 atelier, départ 4',
            constatationQ18: 4,
            reconduite: true,
          },
          {
            reference: 'Q18-3',
            description: 'Présence importante de poussière dans le TGBT.',
            localisation: 'TGBT, local électrique',
            constatationQ18: 5,
          },
        ],
      },
    ],
  };
}

/** Thermographie récente, pas encore relue : sert à essayer la validation des réserves. */
export function lyonThermography(on: string): DemoReport {
  const visit = shift(on, -25);
  return {
    fileName: `Thermographie Q19 ${visit.slice(0, 4)} - Usine de Lyon.pdf`,
    documents: [
      {
        type: 'q19',
        organisme: THERMOGRAPHE,
        numeroRapport: `TV-${visit.replaceAll('-', '')}`,
        dateVisite: visit,
        q19: { anomaliesPriorite1: 1, anomaliesPriorite2: 2, anomaliesPriorite3: 1 },
        reserves: [
          {
            reference: 'A1',
            description: 'Échauffement de la connexion amont du départ 2.',
            preconisation: 'Resserrer la connexion, contrôler après remise en charge.',
            localisation: 'TGBT, départ 2',
            gravite: 'Priorité 1',
            thermique: { temperatureDefaut: 78.4, temperatureReference: 31.2 },
            confiance: 0.93,
          },
          {
            reference: 'A2',
            description: 'Échauffement anormal sur le bornier du départ soudure du TD2.',
            localisation: 'TD2, départ soudure',
            gravite: 'Priorité 2',
            thermique: { temperatureDefaut: 54.1, temperatureReference: 29.8 },
            confiance: 0.88,
          },
          {
            reference: 'A3',
            description: 'Point chaud sur le contacteur principal.',
            localisation: 'Presse 3, armoire de commande',
            gravite: 'Priorité 2',
            thermique: { temperatureDefaut: 49.5, temperatureReference: 30.1 },
            confiance: 0.81,
          },
          {
            reference: 'A4',
            description: 'Léger échauffement d’un fusible de la batterie.',
            localisation: 'local serveur',
            gravite: 'Priorité 3',
            thermique: { temperatureDefaut: 38.2, temperatureReference: 27.5 },
            confiance: 0.62,
          },
        ],
      },
    ],
  };
}

/** Villefranche : vérification d'il y a presque un an, échéance dans les semaines qui viennent. */
export function villefrancheReport(on: string): DemoReport {
  const visit = shift(addMonths(on, -12), 20);
  const code = (n: number) => `CERA/VIL/${String(n).padStart(3, '0')}`;
  return {
    fileName: `Vérification électrique ${visit.slice(0, 4)} - Entrepôt de Villefranche.pdf`,
    documents: [
      {
        type: 'periodique',
        organisme: ORGANISME,
        numeroRapport: `CERA-V-${visit.replaceAll('-', '')}`,
        dateVisite: visit,
        reserves: [
          {
            reference: '1',
            codeObservation: code(1),
            description: 'Schéma unifilaire du TGBT non à jour.',
            preconisation: 'Mettre à jour le schéma après les dernières modifications.',
            article: 'R.4226-12',
            localisation: 'TGBT Entrepôt',
          },
          {
            reference: '2',
            codeObservation: code(2),
            description: 'Différentiel du circuit des quais déclenchant au-delà du seuil.',
            preconisation: 'Remplacer le dispositif différentiel.',
            article: 'R.4226-14',
            localisation: 'TD Quais',
            gravite: 'Danger grave',
          },
          {
            reference: '3',
            codeObservation: code(3),
            description: 'Câble du chargeur posé au sol dans la zone de circulation des chariots.',
            preconisation: 'Faire cheminer le câble en hauteur ou sous protection.',
            article: 'R.4226-7',
            localisation: 'Chargeur chariots',
          },
          {
            reference: '4',
            codeObservation: code(4),
            description: 'Bloc autonome d’éclairage de sécurité masqué par le rayonnage.',
            preconisation: 'Déplacer le bloc pour qu’il reste visible.',
            article: 'R.4227-14',
            localisation: 'BAES allée 3',
          },
        ],
      },
    ],
  };
}
