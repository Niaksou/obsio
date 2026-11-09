# Plateforme de marque d'Obsio

Identité graphique d'Obsio : plateforme (ce document), logo (étape 2, retenu), charte graphique complète (étape 3, `docs/marque/charte.html`), puis déclinaison sur les e-mails et les documents (étape 4).

La charte graphique est la référence pour toute nouvelle page ou tout nouveau support : couleurs et contrastes, échelle typographique, plaque gravée, composants, espaces, rayons, mouvement, icônes, ton, applications. Ses valeurs sont celles de `apps/web/src/styles.css` ; si l'une change, on met à jour les deux.

## Ce que fait Obsio

Obsio suit les réserves des vérifications électriques réglementaires, du rapport PDF de l'organisme de contrôle jusqu'à leur levée prouvée, pour les sites industriels et les PME multi-bâtiments.

**Promesse.** Chaque réserve levée, avec sa preuve.

**Le nom.** Obsio vient d'*observation* : c'est le mot que les rapports emploient pour une non-conformité. Le nom part du document que reçoit le client, pas d'une idée de technologie.

## Pour qui

| Qui | Où et comment | Ce qu'il attend de la marque |
| --- | --- | --- |
| Responsable maintenance ou HSE (décide, paie) | Bureau, ordinateur, entre deux urgences | Du calme et des preuves : savoir ce qui reste ouvert, être prêt pour l'inspection du travail ou l'assureur |
| Technicien interne | Atelier, téléphone | Une liste claire, rien à apprendre |
| Électricien sous-traitant, sans compte | Devant l'armoire, téléphone, parfois sans réseau, mains occupées | Lire vite, photographier, envoyer, repartir |

Le premier lecteur est un responsable qui a déjà une pile de problèmes. La marque ne doit pas en rajouter : elle range.

## Caractère

**Exact, solide, sans drame.**

- *Exact* : le vocabulaire du métier, des dates, des repères, des chiffres justes. Rien d'approximatif.
- *Solide* : un outil de travail, comme une armoire bien câblée. Durable plutôt que tendance.
- *Sans drame* : la sécurité électrique est sérieuse, mais la marque ne vend pas la peur. Le danger est signalé quand il existe (un Q18 « risque », une échéance dépassée), jamais utilisé comme décor.

## Ton

On parle comme un bon chef d'atelier : court, factuel, avec les mots du métier.

| On écrit | On n'écrit pas |
| --- | --- |
| 3 réserves en retard sur le TGBT | Attention ! Votre conformité est en danger |
| Réserve levée le 12 mars, preuve jointe | Bravo, encore une victoire pour votre sécurité 🎉 |
| Importez le rapport : les réserves sont extraites, vous les validez | L'IA révolutionne votre conformité |
| Le lien de l'électricien a expiré. Envoyez-en un nouveau depuis la réserve | Oups, une erreur est survenue |

Règles : phrases courtes, voix active, pas de point d'exclamation, pas d'émoji, pas de « magique », de « révolutionnaire » ni de « boosté à l'IA ». L'extraction automatique est décrite par ce qu'elle fait (« les réserves sont extraites du rapport, vous les validez »), toujours avec la validation humaine.

Vocabulaire : réserve, levée, preuve, repère, armoire, TGBT, tableau divisionnaire, organisme de contrôle, échéance, reconduite. On évite le jargon logiciel (ticket, workflow, dashboard dans les textes visibles).

## Univers visuel : l'armoire

L'identité puise dans ce que l'électricien a sous les yeux quand il ouvre une armoire bien tenue, et dans le plan technique du bâtiment.

- **La plaque gravée** : l'étiquette en stratifié qui repère chaque départ (« TD Quais », « Q12 »). C'est l'objet le plus reconnaissable du métier et la **signature** d'Obsio : elle porte les repères d'équipement dans l'application, sur le plan et dans les documents, et seulement eux.
- **Le cuivre** : le conducteur mis à nu, seul accent chaud. Il marque ce qui est actif ou sélectionné.
- **La coupe d'un conducteur** : l'âme de cuivre dans sa gaine, la marque actuelle. Elle sera retravaillée à l'étape 2.
- **Le cartouche du plan** : le bloc-titre des plans techniques, qui range les faits dans des cases.
- **Les teintes minérales** pour les statuts : grenat, cobalt, ocre, vert-de-gris. Sourdes, toujours accompagnées de leur libellé.

### Palette

| Rôle | Nom | Valeur |
| --- | --- | --- |
| Texte, aplats, plaques | Encre | `#18201f` |
| Fond | Tôle claire | `#f6f7f6` |
| Surfaces | Blanc | `#ffffff` |
| Accent unique | Cuivre | `#b4531f` |
| Statut levé, second ton de marque | Vert-de-gris | `#0e6b5e` |
| Danger, retard | Grenat | `#b42335` |

### Typographie

- **Barlow** pour l'interface et les textes : un dessin issu de la signalétique routière et industrielle, lisible en petit et sur téléphone.
- **Barlow Semi Condensed** pour les titres et les plaques gravées : la largeur réduite des lettrages techniques.

## Logo

Retenu : la piste C, « O gainé ». Le O d'Obsio est la coupe d'un conducteur : une gaine de l'épaisseur des lettres et une âme de cuivre. Le symbole est dans le nom, il reste lisible à 16 px et s'imprime en deux couleurs. Les autres pistes (A, B, D, E) et leur comparaison sont dans `docs/marque/logo.html`.

- Lettres vectorisées depuis Barlow Semi Condensed 600 (licence OFL, qui autorise cet usage).
- Couleurs : gaine et lettres en encre (`#18201f`) sur fond clair, en blanc sur fond sombre ; l'âme reste toujours en cuivre (`#b4531f`).
- Le symbole seul (le rond) s'emploie quand la place manque : favicon, icône d'application, tampon. Il vit mieux avec le mot, car seul il peut rappeler un bouton d'enregistrement.
- Ne pas déformer le logo, ni recolorer l'âme, ni ajouter d'ombre ou de contour, ni le poser sur une photo chargée.

| Fichier | Usage |
| --- | --- |
| `docs/marque/logo/c-lockup.svg` | Logo, fond clair |
| `docs/marque/logo/c-lockup-inverse.svg` | Logo, fond sombre |
| `docs/marque/logo/c-symbol.svg`, `c-symbol-inverse.svg` | Symbole seul |
| `apps/web/src/components/Logo.tsx` | Logo dans l'application, à la couleur du texte |
| `apps/web/public/favicon.svg` | Favicon, s'adapte au thème clair ou sombre du navigateur |
| `apps/web/public/icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | Icônes de l'application installée (PWA, Android, iPhone) |

## Ce qu'Obsio évite

Ces images sont celles de tout le secteur, ou de tout logiciel récent. Elles rendraient Obsio interchangeable.

- L'éclair, la prise, l'ampoule.
- Les bandes jaunes et noires du danger, le triangle d'avertissement en décor.
- Le bleu électrique et les effets lumineux.
- Le bouclier ou la coche verte de la « conformité garantie ».
- Les codes de l'IA : violet, dégradés, étincelles, robots.
- Le pastiche de marque de luxe ou de start-up : fond crème et titre à empattements, ou noir profond et accent fluo.

## Points restant à confirmer

1. La promesse « Chaque réserve levée, avec sa preuve ».
2. Le caractère « exact, solide, sans drame » et le ton du chef d'atelier.
3. La plaque gravée comme signature et l'armoire comme univers.

Le détail des couleurs (tous les neutres, le cuivre en trois tons, les statuts et leurs contrastes), l'échelle typographique (12, 13, 14, 15, 16, 18, 20, 22, 28, 32 et 40 px) et les composants sont dans la charte.

Restent à habiller avec la marque : les e-mails (HTML sans mise en forme pour l'instant) et l'en-tête du dossier de preuves en PDF.
