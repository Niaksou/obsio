import type { Tour } from './engine.js';

// Contenu des tutoriels : une phrase par étape, l'interface montre le reste.
// Chaque cible correspond à un attribut data-tour dans les composants.

const exact = (pattern: RegExp) => (path: string) => pattern.test(path);

export const TOURS: Tour[] = [
  {
    id: 'bienvenue',
    title: 'Premiers pas',
    match: exact(/^\/$/),
    auto: true,
    steps: [
      {
        target: 'nav-sites',
        title: 'Sites',
        body: 'Vos établissements, leurs plans et leurs réserves.',
      },
      {
        target: 'nav-mes-reserves',
        title: 'Mes réserves',
        body: 'Ce qu’on vous confie, le plus urgent en haut.',
      },
      {
        target: 'nav-verifications',
        title: 'Échéances',
        body: 'Les prochaines visites de l’organisme de contrôle.',
      },
      {
        target: 'nav-organisation',
        title: 'Organisation',
        body: 'Les membres et les électriciens externes.',
      },
      {
        target: 'account-link',
        title: 'Mon compte',
        body: 'Clés d’accès, notifications, sessions.',
      },
      { target: 'nav-plus', title: 'Plus', body: 'Votre compte, l’organisation, les tutoriels.' },
      { target: 'tutoriels', title: 'Tutoriels', body: 'Rejouez un tutoriel ici, à tout moment.' },
      { target: 'add-site', title: 'Premier site', body: 'Ajoutez l’établissement contrôlé.' },
      { target: 'site-row', title: 'À vous', body: 'Ouvrez un site.', action: 'click' },
    ],
  },
  {
    id: 'site',
    title: 'Un site',
    match: exact(/^\/sites\/[^/]+$/),
    steps: [
      {
        target: 'site-dashboard',
        title: 'Tableau de bord',
        body: 'En cours, en retard, levées : touchez un chiffre.',
      },
      {
        target: 'site-inspections',
        title: 'Échéances',
        body: 'Prochaine visite pour chaque type de contrôle.',
      },
      {
        target: 'site-building',
        title: 'Bâtiments',
        body: 'Chaque étage a son plan, réserves placées dessus.',
      },
      {
        target: 'add-building',
        title: 'Nouveau bâtiment',
        body: 'Ajoutez les bâtiments, puis les étages.',
      },
      {
        target: 'site-reports',
        title: 'Rapports',
        body: 'Déposez le PDF : les réserves sont extraites.',
      },
    ],
  },
  {
    id: 'reserves',
    title: 'Liste des réserves',
    match: exact(/^\/sites\/[^/]+\/reserves$/),
    steps: [
      { target: 'reserves-filters', title: 'Filtres', body: 'En cours, les vôtres, en retard…' },
      {
        target: 'reserve-select',
        title: 'Sélection',
        body: 'Cochez une réserve.',
        action: 'click',
      },
      {
        target: 'selection-bar',
        title: 'Confier',
        body: 'À des collaborateurs, ou à un intervenant par lien.',
      },
      { target: 'reserve-row', title: 'Détail', body: 'Touchez une réserve pour l’ouvrir.' },
      { target: 'dossier-export', title: 'Dossier', body: 'Le PDF des preuves, pour l’assureur.' },
    ],
  },
  {
    id: 'reserve',
    title: 'Corriger une réserve',
    match: exact(/^\/reserves\/[^/]+$/),
    steps: [
      { target: 'reserve-head', title: 'La réserve', body: 'Statut, échéance, équipement.' },
      {
        target: 'reserve-review',
        title: 'À vérifier',
        body: 'Levez la réserve, ou refusez la correction.',
      },
      { target: 'reserve-collaborators', title: 'Collaborateurs', body: 'Qui doit la corriger.' },
      { target: 'photo-add', title: 'Photo', body: 'Photographiez la correction.' },
      { target: 'proof-corrected', title: 'Corrigée', body: 'Cochez une fois réparé.' },
      { target: 'proof-send', title: 'Envoyer', body: 'Sans réseau, l’envoi partira tout seul.' },
      { target: 'reserve-journal', title: 'Journal', body: 'Qui a fait quoi, et quand.' },
    ],
  },
  {
    id: 'plan',
    title: 'Le plan',
    match: exact(/^\/etages\/[^/]+$/),
    steps: [
      {
        target: 'plan-area',
        title: 'Plan',
        body: 'Un repère par équipement, coloré selon ses réserves.',
      },
      { target: 'plan-tools', title: 'Outils', body: 'Recentrer, mesurer, placer un équipement.' },
      { target: 'title-block', title: 'Cartouche', body: 'Site, bâtiment, étage et échelle.' },
    ],
  },
  {
    id: 'import',
    title: 'Valider un rapport',
    match: exact(/^\/imports\/[^/]+$/),
    steps: [
      {
        target: 'draft-row',
        title: 'Relire',
        body: 'Touchez une réserve lue par l’IA.',
        action: 'click',
      },
      {
        target: 'draft-editor',
        title: 'Corriger',
        body: 'Comparez au PDF, puis retenez ou écartez.',
      },
      { target: 'review-pdf', title: 'PDF', body: 'Le passage d’origine est surligné.' },
      { target: 'import-validate', title: 'Valider', body: 'Active les réserves retenues.' },
    ],
  },
  {
    id: 'mes-reserves',
    title: 'Mes réserves',
    match: exact(/^\/mes-reserves$/),
    steps: [
      {
        target: 'my-reserves',
        title: 'Vos réserves',
        body: 'Le plus urgent en haut. Touchez pour corriger.',
      },
      {
        target: 'push-suggestion',
        title: 'Notifications',
        body: 'Soyez prévenu sur cet appareil.',
      },
    ],
  },
  {
    id: 'verifications',
    title: 'Échéances de contrôle',
    match: exact(/^\/verifications$/),
    steps: [
      {
        target: 'due-to-handle',
        title: 'À traiter',
        body: 'Visites en retard ou à programmer, par date.',
      },
      {
        target: 'due-unknown',
        title: 'Sans rapport',
        body: 'Importez un rapport pour connaître l’échéance.',
      },
    ],
  },
  {
    id: 'organisation',
    title: 'Organisation',
    match: exact(/^\/organisation$/),
    steps: [
      {
        target: 'org-contractor',
        title: 'Électriciens',
        body: 'Ce qui leur est confié : en cours, en retard, à vérifier.',
      },
      {
        target: 'org-add-contractor',
        title: 'Ajouter',
        body: 'Ou directement en confiant une réserve.',
      },
    ],
  },
  {
    id: 'compte',
    title: 'Mon compte',
    match: exact(/^\/compte$/),
    steps: [
      {
        target: 'account-passkeys',
        title: 'Clés d’accès',
        body: 'Connexion d’un geste, sans mot de passe.',
      },
      { target: 'account-push', title: 'Notifications', body: 'À activer sur chaque appareil.' },
      {
        target: 'account-sessions',
        title: 'Sessions',
        body: 'Fermez celles que vous ne reconnaissez pas.',
      },
    ],
  },
  {
    id: 'intervention',
    title: 'Envoyer une correction',
    match: exact(/^\/intervention\/[^/]+$/),
    auto: true,
    steps: [
      {
        target: 'intervention-item',
        title: 'Vos réserves',
        body: 'Touchez une réserve.',
        action: 'click',
      },
      { target: 'photo-add', title: 'Photo', body: 'Photographiez la correction.' },
      { target: 'proof-corrected', title: 'Corrigée', body: 'Cochez une fois réparé.' },
      { target: 'proof-send', title: 'Envoyer', body: 'Sans réseau, l’envoi partira tout seul.' },
    ],
  },
];
