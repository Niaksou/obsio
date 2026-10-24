# Conventions d'extraction des réserves

Ces règles décrivent ce que l'extraction doit produire pour un rapport de vérification électrique. Elles servent à écrire les résultats attendus du jeu de test (`fixtures/reports/**/*.expected.json`, hors dépôt) et à rédiger le prompt d'extraction. Le format est défini par `extractedReportSchema` dans `packages/shared/src/extraction.ts`.

## Périmètre

- Une réserve = une observation numérotée de la **liste récapitulative des observations** (chapitre imposé par l'arrêté du 26 décembre 2011). On ne reprend pas les remarques des chapitres de mesurages ou d'examen qui ne figurent pas dans cette liste.
- Haute et basse tension sont toutes reprises, dans l'ordre du rapport.
- Une observation qui court sur deux pages est une seule réserve ; `pageSource` est la page où elle commence.
- `pageSource` est le numéro de page du **fichier PDF** (1 pour la première page), pas la pagination imprimée.
- Un fichier peut réunir plusieurs documents (par exemple un compte rendu Q18 suivi du rapport du Code du travail). On extrait le rapport principal, celui du Code du travail s'il y en a un.
- Un rapport sans observation donne une liste `reserves` vide : on n'invente jamais de réserve.

## Champs

- `reference` : le numéro tel qu'imprimé, sans « Obs. » ni astérisque (« 12 », « 3.2 »). Si le rapport donne aussi un code d'observation interne (Bureau Veritas : « LM/090920/100950/0 »), la référence reste le numéro d'ordre.
- `description` : le constat, recopié fidèlement (fautes comprises), sans la préconisation.
- `preconisation` : la phrase d'action (« A réaliser. », « A remplacer par… ») quand le rapport la sépare du constat, y compris quand elle est marquée « (P) ». Si l'observation n'est rédigée que comme une action (« Reposer la verrine… »), tout le texte va dans `description` et `preconisation` vaut `null`.
- `articleReglementaire` : les références citées, lignes jointes par une espace, dans l'ordre du rapport (« R.4215-3 R.4226-7 NF C 15-100 § 543 »).
- `localisationTexte` : le chemin de localisation donné par le rapport, du plus large au plus précis, niveaux séparés par « / » et sans les tirets de liste (« BATIMENT ATELIER / ATELIER / COFFRET BT / Général »). Casse d'origine conservée.
  - Uniquement des lieux, équipements ou circuits. Les intitulés de thème ou de catégorie ne sont pas des lieux : « Observation(s) local », « Observation(s) générale(s) », « Eclairage de sécurité », « Circuit de protection ». `null` s'il ne reste aucun lieu.
  - Une précision de lieu écrite au-dessus de l'observation (« Dernier luminaire à droite ») fait partie du chemin. Quand le rapport écrit le lieu au début du texte de l'observation (Dekra : « Garderie \ Appareil d'éclairage fixe \ Absence de… »), il va dans `localisationTexte` et pas dans `description`.
- `gravite` : uniquement si le rapport indique une gravité ou une priorité pour l'observation ; `null` sinon. On n'en invente pas.
- `nouvelleOuReconduite` :
  - `reconduite` si le rapport marque l'observation comme déjà signalée (colonne cochée, astérisque, date de premier signalement antérieure à la visite) ;
  - `nouvelle` si le rapport prévoit ce marquage et qu'il est absent pour cette observation ;
  - `null` si le rapport ne donne aucune information à ce sujet.
  - Le marquage est parfois uniquement visuel : badge « nouvelle » contre numéro cerclé (Apave), texte en gras (Alpes Contrôles). Il faut alors lire la page en image, le texte seul ne suffit pas.

## En-tête

- `organisme` : la raison sociale de l'organisme de contrôle (« SOCOTEC Equipements »).
- `typeVerification` : `periodique` (art. R. 4226-16), `initiale` (art. R. 4226-14), `q18` (référentiel APSAD D18), `autre`.
- `dateVisite` : premier jour d'intervention sur site, pas la date de rédaction.
- `site` : l'établissement vérifié (nom et adresse sur une ligne), pas l'adresse de facturation ni l'agence de l'organisme.
