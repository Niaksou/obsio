# Conventions d'extraction des réserves

Ces règles décrivent ce que l'extraction doit produire pour un rapport de vérification électrique : rapport du Code du travail, compte rendu Q18 (référentiel APSAD D18) ou contrôle par thermographie Q19 (référentiel APSAD D19). Elles servent à écrire les résultats attendus du jeu de test (`fixtures/reports/**/*.expected.json`, hors dépôt) et à rédiger le prompt d'extraction. Le format est défini par `extractedReportSchema` dans `packages/shared/src/extraction.ts`.

## Documents

- Un fichier peut réunir plusieurs documents : rapport du Code du travail, compte rendu Q18, compte rendu Q19. On extrait **chaque document**, dans l'ordre du fichier, avec son propre en-tête et ses propres réserves.
- Un document cité mais absent du fichier (« Pièce jointe : Déclaration Domaine Q18 ») n'est pas extrait.
- Les champs `q18` et `q19` ne sont renseignés que pour un document de ce type (`null` sinon). Les champs `constatationQ18` et `thermique` d'une réserve aussi.

## Périmètre (rapport du Code du travail)

- Une réserve = une observation numérotée de la **liste récapitulative des observations** (chapitre imposé par l'arrêté du 26 décembre 2011). On ne reprend pas les remarques des chapitres de mesurages ou d'examen qui ne figurent pas dans cette liste.
- Haute et basse tension sont toutes reprises, dans l'ordre du rapport.
- Une observation qui court sur deux pages est une seule réserve ; `pageSource` est la page où elle commence.
- `pageSource` est le numéro de page du **fichier PDF** (1 pour la première page), pas la pagination imprimée.
- Un rapport sans observation donne une liste `reserves` vide : on n'invente jamais de réserve.

## Champs

- `reference` : le numéro tel qu'imprimé, sans « Obs. » ni astérisque (« 12 », « 3.2 »). Si les points ne sont pas numérotés, on les numérote « 1 », « 2 »… dans l'ordre du document.
- `codeObservation` : le code d'observation interne de l'organisme quand il en donne un (Bureau Veritas : « LM/090920/100950/0 »), `null` sinon. Il est repris d'un document à l'autre et sert à rapprocher une même anomalie signalée dans le rapport du Code du travail et dans le Q18.
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

## Compte rendu Q18

- Le document Q18 comprend le formulaire du CNPP (2 pages) et les annexes qui s'y rattachent (Bureau Veritas : « Liste récapitulative des observations issues de la vérification », pages marquées « Rapport n° ….Q18 »).
- `q18.constatations` : les 8 constatations standard, numérotées de 1 à 8, avec la colonne cochée : `absence_danger`, `danger_nouveau` (« danger signalé pour la 1re fois »), `danger_deja_signale`, `sans_objet` (mention SO), `non_verifie` (mention NV). La croix n'est souvent lisible que sur l'image de la page.
- `q18.conclusion` : `risque` si la case « peut entraîner des risques d'incendie et d'explosion » est cochée, `pas_de_risque` pour « ne peut pas », `null` si aucune case n'est lisible.
- Réserves : chaque point de la section « Points de non-conformité ou anomalies constatés et préconisations associées », ou de l'annexe à laquelle elle renvoie. « Néant » ou « Aucune non-conformité » donne une liste vide. Les champs se remplissent comme pour le rapport du Code du travail (colonnes « Observations », « Composant », « Préconisation » ; année ou date de premier signalement pour `nouvelleOuReconduite`).
- `constatationQ18` : le numéro de la constatation standard à laquelle le point se rattache, quand le rapport l'indique ou quand le sujet correspond sans ambiguïté à une constatation cochée en danger (protection contre les surintensités → 3, poussière dans les armoires → 5, échauffement → 1, continuité du conducteur de protection → 7). `null` sinon.
- Une constatation cochée en danger sans point qui s'y rattache n'est **pas** transformée en réserve par l'extraction : c'est l'application qui la proposera comme réserve à la validation, pour ne jamais inventer de texte.

## Compte rendu et rapport Q19 (thermographie)

- Le document Q19 comprend le compte rendu du CNPP, la liste récapitulative des anomalies et le rapport de thermographie avec ses fiches d'anomalie.
- `q19` : le nombre d'anomalies de priorité 1, 2 et 3 imprimé sur le compte rendu (`null` pour un nombre absent). Il sert à vérifier qu'aucune fiche n'est oubliée.
- Réserves : une par fiche d'anomalie (ou par ligne de la liste récapitulative s'il n'y a pas de fiche), dans l'ordre des numéros de fiche. « Aucune anomalie » donne une liste vide. Les anomalies de priorité 3 sont aussi extraites.
  - `reference` : le numéro de la fiche.
  - `description` : le constat (« Anomalie détectée »), sans la cause probable.
  - `preconisation` : la préconisation ou l'action corrective proposée.
  - `localisationTexte` : emplacement, matériel contrôlé et élément en défaut, du plus large au plus précis, séparés par « / » (les « `\` » du rapport deviennent « / »).
  - `gravite` : « Priorité 1 », « Priorité 2 » ou « Priorité 3 », selon le degré de priorité coché.
  - `nouvelleOuReconduite` : `reconduite` si la colonne « défaut déjà signalé » est cochée (ou « oui »), `nouvelle` sinon.
  - `pageSource` : la page de la fiche d'anomalie (celle du thermogramme).
  - `articleReglementaire` : `null`.
  - `thermique` : `temperatureDefaut` = température maximale du défaut ; `temperatureReference` = température de l'élément similaire ou de la zone de comparaison (à défaut, la température ambiante utilisée pour l'écart) ; `ecart` = écart imprimé entre ces deux températures, `null` s'il n'est pas imprimé (on ne le calcule pas).

## En-tête (pour chaque document)

- `organisme` : la raison sociale de l'organisme de contrôle (« SOCOTEC Equipements »).
- `type` : `periodique` (art. R. 4226-16), `initiale` (art. R. 4226-14), `q18` (référentiel APSAD D18), `q19` (référentiel APSAD D19), `autre`.
- `numeroRapport` : le numéro du document (chaque document du fichier a le sien).
- `dateVisite` : premier jour d'intervention sur site (« Nous déclarons avoir procédé le », « Date de la visite », « Date ou période du contrôle »), pas la date de rédaction.
- `site` : l'établissement vérifié (nom et adresse sur une ligne), pas l'adresse de facturation ni l'agence de l'organisme.
