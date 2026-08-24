# PortfolioLab — Status

Dernière mise à jour : 24 août 2026

## Phase

**Design V2 — DS-07 : fonds et options**

## État global

| Sujet                             | État                                            |
| --------------------------------- | ----------------------------------------------- |
| Produit défini                    | oui                                             |
| Skill Claude Code                 | fusionné dans `main` (PR #1)                    |
| Architecture documentée           | oui, 9 ADR                                      |
| Workspace exécutable              | oui                                             |
| PWA installable                   | oui, avec cache hors ligne daté                 |
| Base de données                   | PostgreSQL, 3 migrations, RLS activée et forcée |
| Authentification                  | oui (Lot 02)                                    |
| Moteur de valorisation            | oui, décimal exact, réconciliation vérifiée     |
| Historique du patrimoine          | oui, points mesurés — jamais reconstitués       |
| Fournisseur de marché choisi      | **non** — bloqué, voir « Blocage majeur »       |
| Matrice de couverture exécutée    | oui, 19 instruments, tous `NOT_RUN`             |
| Cours réels                       | aucun ; fixtures et fournisseur simulé          |
| Clé API réelle en dépôt           | aucune, par conception                          |
| Donnée financière réelle en base  | aucune, par conception                          |
| Export et suppression des données | oui, suppression vérifiée table par table       |
| Audit des dépendances             | 0 vulnérabilité, vérifié en CI                  |
| Déploiement                       | aucun                                           |

## Avancement par lot

| Lot | Objet                                             | État              |
| --- | ------------------------------------------------- | ----------------- |
| 00  | Spécification et skill                            | terminé, fusionné |
| 01  | Fondation workspace, PWA, design, CI              | terminé, fusionné |
| 02  | Auth, PostgreSQL, RLS                             | terminé, fusionné |
| 03  | Comptes et positions manuelles                    | terminé, fusionné |
| 04  | Résolution d'instruments et matrice de couverture | terminé, fusionné |
| 05  | Actions, ETF et FX live                           | terminé, fusionné |
| 06  | Fonds et NAV                                      | terminé, fusionné |
| 07  | Options                                           | terminé, fusionné |
| 08  | Dashboard et analyse                              | terminé, fusionné |
| 09  | Fiabilité, PWA et sécurité                        | terminé, fusionné |
| 10  | Release candidate 1.0                             | terminé           |

## Refonte Design V2

Direction visuelle : bleu-nuit, trois niveaux de surface, accent chartreuse.
Aucun calcul financier, aucune règle de sécurité et aucune migration ne sont
touchés par cette refonte — voir `docs/design-v2/audit.md`, section « modules
intouchables ».

| Lot   | Objet                               | État    |
| ----- | ----------------------------------- | ------- |
| DS-01 | Tokens et primitives                | terminé |
| DS-02 | Shell, en-tête, navigation mobile   | terminé |
| DS-03 | Accueil et patrimoine               | terminé |
| DS-04 | Positions et fiche détaillée        | terminé |
| DS-05 | Parcours d'ajout simplifié          | terminé |
| DS-06 | Analyse et graphiques               | terminé |
| DS-07 | Fonds et options                    | terminé |
| DS-08 | Réglages, comptes, données et états | à faire |
| DS-09 | Polish, motion, accessibilité, PWA  | à faire |

### DS-07 — livrables vérifiés

- **l'écran Fonds montre enfin ce qui est détenu.** Il affichait la valeur nette
  d'inventaire et pas les parts détenues : il ne répondait qu'à la moitié de la
  question, la NAV étant une donnée de marché quand ce que l'on possède est la
  raison d'ouvrir cet écran. NAV et position sont désormais côte à côte, toutes
  deux en taille dominante, avec le compte de rattachement ;
- **la date de valeur accompagne la NAV** au lieu d'occuper une ligne de
  tableau : une NAV sans sa date ne dit pas ce qu'elle vaut ;
- **les caractéristiques du fonds sont repliées** — classe de parts, devise,
  fréquence, revenus, domiciliation, profondeur d'historique. Elles servent à
  vérifier qu'on regarde la bonne classe de parts, question décisive mais posée
  une fois ; dépliées, elles reléguaient la NAV en haut d'une liste de huit
  lignes. Un parcours E2E vérifie qu'elles restent atteignables ;
- **la méthode de valorisation accompagne chaque exposition options.** Un
  notionnel de plusieurs dizaines de milliers de francs n'a pas le même poids
  selon qu'il repose sur un point milieu de marché ou sur une saisie manuelle,
  et le chiffre seul ne le disait pas. Plusieurs méthodes sont listées quand les
  contrats d'un même sous-jacent n'ont pas été valorisés de la même façon : le
  cas mérite d'être vu, pas moyenné ;
- les méthodes sont **dérivées dans la couche de lecture**, à partir des seules
  positions retenues par `prepareOptionExposure`. Le moteur de calcul n'est pas
  modifié, et les contrats écartés — déjà comptés à part — ne font mentionner
  aucune méthode n'ayant contribué à un chiffre affiché ;
- primitives `Card` et `Stat` appliquées aux deux écrans.

### DS-06 — livrables vérifiés

- **sélecteur de période** au-dessus de la courbe. Les fenêtres sont découpées
  **sur le serveur** : le moteur décimal reste hors du navigateur, et les
  bornes ne peuvent pas différer entre ce qui est calculé et ce qui est
  affiché. Une fenêtre n'est proposée que si elle contient au moins deux points
  **réellement enregistrés** — « 1 mois » ne reconstitue jamais une valeur d'il
  y a trente jours ;
- **les fenêtres identiques sont fusionnées, sous le libellé le plus étroit.**
  Proposer « 1 mois », « 3 mois » et « 6 mois » pour la même courbe donne trois
  onglets qui ne changent jamais rien ; et un onglet « 3 mois » au-dessus d'une
  courbe de vingt jours se lit comme un écran cassé. Seul « Tout » garde son
  libellé large : il ne promet pas une durée, il dit que rien n'est écarté ;
- **écran réordonné selon l'architecture d'information** : période, évolution,
  répartition, performance par position, comptes et devises. Une carte, une
  question ;
- **section « Détails avancés » repliée** : exposition options, réconciliation
  et enregistrement d'un point sont des outils de vérification, pas des
  questions quotidiennes. La page passe de 2 270 à 1 745 pixels sur desktop ;
- **huit tests unitaires** sur le découpage : série non comparable, fenêtre à
  un seul point, fusion, variation calculée sur les seuls points de la fenêtre,
  date d'ancrage invalide.

Trois défauts trouvés pendant le lot :

- **l'historique de démonstration vieillissait.** Ses dates étaient écrites en
  dur en mai 2026 : passé un an, il serait sorti de toutes les fenêtres et la
  courbe aurait disparu de l'écran sans qu'une ligne de code ait changé. Les
  dates du seed sont désormais relatives à son installation, les décalages en
  jours restant figés pour que la forme de la courbe soit identique d'une
  installation à l'autre. Deux tests qui citaient des dates du calendrier ont
  été réécrits pour porter sur la forme de l'historique ;
- **le dépliant tronquait le tableau d'exposition.** Ses deux pixels de bordure
  rétrécissaient les sections imbriquées, et le notionnel se remettait à être
  coupé sur 390 px — le défaut même qu'un parcours E2E surveille depuis le
  Lot 08, qui l'a repris immédiatement. Le dépliant ne porte plus de bordure ;
- **le lien vers les fonds était devenu introuvable**, replié avec les outils
  de vérification. C'est de la navigation, pas de la vérification : il est
  ressorti dans sa propre carte.

### DS-05 — livrables vérifiés

- **une question d'abord, les champs ensuite.** Le formulaire posait six
  questions d'un bloc, dont deux listes déroulantes et trois paragraphes
  d'explication : sur 390 px on atteignait à peine « Quantité ». Le premier
  écran demande maintenant « Qu'ajoutez-vous ? » et propose six cartes
  compactes — Action, ETF, Fonds, Option, Cash, Autre — qui tiennent entièrement
  dans le premier écran, explication comprise ;
- **la liste d'instruments est réduite à la classe choisie.** Choisir « Fonds »
  ne laisse que le fonds : la deuxième liste déroulante cesse d'être un
  catalogue à parcourir ;
- **les champs masqués ne sont pas montés**, pas seulement cachés. Un champ
  rendu puis masqué en CSS partirait quand même au serveur, et l'étape
  n'aurait plus rien d'une étape. Un parcours E2E interroge le DOM plutôt que
  la visibilité ;
- **une carte sans instrument enregistré est inerte et dit pourquoi.** « Aucun
  enregistré » est une explication ; une carte grisée muette se lit comme une
  panne ;
- **les options gardent leur sélection guidée** : un symbole d'option mal tapé
  désigne un autre contrat existant, pas une erreur, et rien ne le
  signalerait ;
- **le bouton d'enregistrement redevient atteignable sans faire défiler** sur
  390 px, navigation basse comprise. Quantité et coût passent sur deux colonnes
  dès le mobile — deux nombres courts empilés coûtaient quatre-vingts pixels —
  et les notes, optionnelles, sont repliées. Un parcours E2E compare la
  position du bouton à la hauteur utile ; vérifié par mutation, il échoue bien
  dès qu'on rétablit l'empilement.

Le parcours reste **un seul `<form>` et une seule soumission** : aucune action
serveur, aucune validation et aucun nom de champ ne changent. Le composant
`add-position-form.tsx` est remplacé par `add-position-flow.tsx`.

### DS-04 — livrables vérifiés

- **recherche et filtres sur la liste** : recherche portant sur le nom, le
  symbole **et le compte** — « tout ce que je détiens chez tel établissement »
  est une question aussi fréquente que « où est mon Nestlé » — et chips par
  classe d'actifs, affichées seulement pour les classes réellement présentes ;
- **lignes compactes avec pastille d'identité** : le symbole court ou, à
  défaut, l'émoji de la classe. Les six positions de démonstration tiennent
  désormais dans un seul écran de 390 px, recherche et filtres compris, là où
  cinq et demie entraient auparavant ;
- **badge de fraîcheur seulement s'il apprend quelque chose** : la fraîcheur
  majoritaire est énoncée une fois au-dessus de la liste, et seules les lignes
  qui s'en écartent gardent leur badge. Sur les données de démonstration, cinq
  « Manuel » identiques disparaissent et le fonds en NAV — la seule ligne à
  remarquer — devient visible. La règle exige une majorité stricte et au moins
  deux lignes : à trois lignes en direct et trois périmées, désigner un « cas
  normal » serait arbitraire, et sur une ligne unique le résumé masquerait
  l'unique information au lieu du répétitif ;
- **fiche détaillée réordonnée** selon l'architecture d'information : identité,
  cours retenu, valeur et P&L, historique, métriques propres à la classe,
  détention, provenance repliable, puis modifier et supprimer ;
- **cours unitaire reconstitué** depuis la valorisation plutôt que relu chez le
  fournisseur : `marketValueNative ÷ (quantité × multiplicateur)` redonne
  exactement le cours ayant servi au calcul. Un chiffre plus frais que le total
  rendrait la fiche incohérente avec elle-même. Couvert par six tests unitaires,
  dont l'option à multiplicateur 100 et la position vendue à découvert ;
- **provenance repliée par défaut** (`<details>` natif, donc sans JavaScript) :
  ces champs servent à vérifier un chiffre contesté, pas à être lus chaque
  jour. Ouverts en permanence, ils repoussaient « Modifier » hors du premier
  écran sur 390 px ;
- **bouton de suppression enfin distinct du bouton de confirmation** :
  `SubmitButton` accepte une variante et un libellé d'attente. Peint en accent
  comme « Enregistrer », il invitait au clic exactement là où il faut hésiter.

Trois défauts trouvés pendant le lot, tous corrigés :

- **la saisie tapée avant l'hydratation était perdue**. Le champ rendu par le
  serveur acceptait les lettres alors que React n'écoutait pas encore : rien ne
  se filtrait, puis la saisie disparaissait. Recherche et filtres sont
  désormais inertes tant que le composant n'est pas hydraté — un contrôle
  désactivé est plus honnête qu'un contrôle mort, et c'est aussi le
  comportement correct sans JavaScript du tout, vérifié par un parcours dédié ;
- **`scripts/design-shots.mjs` capturait la liste sous le nom `-detail.png`**,
  et ce depuis les lots précédents : le clic partait avant l'hydratation. Le
  script lit maintenant l'URL de la première position et y navigue
  directement. Une campagne de revue fausse qui ne prévient pas est pire que
  pas de campagne ;
- **deux tables d'émojis divergentes** entre l'accueil et les positions. Elles
  sont fusionnées dans `asset-icon.ts`, et la table est **totale** : une classe
  ajoutée au domaine casse la compilation au lieu de s'afficher en puce
  générique dans deux écrans.

Hors périmètre, laissé tel quel et signalé : aucun historique par position
n'existe — les instantanés portent sur le patrimoine entier. La fiche l'écrit
plutôt que de tracer une courbe inventée ; le tracé viendra avec DS-06. Les
métriques propres aux fonds et aux options restent sommaires, DS-07 les
approfondira, et le bouton de suppression des données dans les réglages garde
l'ancien style tant que DS-08 n'y est pas passé.

### DS-03 — livrables vérifiés

- **hero patrimoine** : le total porte enfin la taille dominante, et la
  variation du jour le rejoint dans le même bloc — « ce que je possède » et
  « combien cela a bougé » forment une seule question ;
- **indicateurs sur une rangée** : trois cartes pleine largeur empilées, soit
  près de 210 px pour trois nombres courts, deviennent une grille de trois
  colonnes lisible d'un coup d'œil ;
- **répartition par classe d'actifs** directement sur l'accueil, en barres
  proportionnelles avec émoji sémantique, limitée aux cinq premières parts ;
- **variante `bare` de `Money`** : le code de devise est annoncé une fois pour
  les trois colonnes au lieu d'être répété. Sur 390 px, trois montants avec
  leur « CHF » ne tenaient pas et le navigateur tronquait `CHF 31'297.30` en
  `CHF 31'297…` ;
- **garde-fou permanent contre la troncature** : un parcours E2E compare
  `scrollWidth` à `clientWidth` sur tout élément numérique, aux quatre tailles.
  Le défaut s'était déjà produit au Lot 08 dans un tableau d'exposition ;
  vérifié par mutation, il échoue bien sur iPhone 390 dès qu'on rétablit le
  préfixe de devise.

Régression corrigée pendant le lot : la première version remplaçait
l'explication du total non calculable par un tiret et une infobulle. Sur un
téléphone il n'y a pas de survol — un utilisateur voyant n'avait plus aucune
explication. Elle est redevenue une ligne visible, affichée seulement dans ce
cas.

### DS-02 — livrables vérifiés

- **bandeaux compacts** : mode démonstration, hors ligne et état de session
  passent d'un pavé de quatre lignes à une ligne de résumé, l'explication étant
  repliée dans un `<details>` natif. Rien n'est masqué par JavaScript — une page
  servie hors ligne est précisément le cas où l'hydratation peut ne pas
  aboutir. Le mot « fictifs » reste dans la ligne visible : ce qui se replie
  n'est que le _pourquoi_ ;
- **en-tête d'écran resserré** : le sous-titre devient une ligne de méta, et une
  zone `action` permet de poser un état à droite du titre plutôt qu'en dessous ;
- **navigation basse** posée sur la surface élevée, onglet actif signalé par une
  pastille d'accent **en plus** de la couleur et de `aria-current` ;
- **effet mesuré** : le patrimoine total commence à 224 px du haut sur iPhone au
  lieu de ~290 px, et la liste des six positions tient désormais dans un seul
  écran en 430×932 ;
- **garde-fou E2E** `montre le patrimoine total dès le haut de l'écran`, qui
  borne la hauteur de tout ce qui précède le chiffre à 280 px. Un simple contrôle
  « au-dessus de la ligne de flottaison » ne mordait pas : sur un écran de
  844 px, le total pouvait glisser de 200 px de plus sans jamais en sortir.
  Vérifié par mutation — le bandeau verbeux d'origine fait échouer le contrôle
  sur les deux iPhone.

Deux collisions corrigées pendant le lot :

- le badge de fraîcheur était cherché par son libellé n'importe où dans la page,
  ce qui faisait dépendre les parcours de la prose ; il porte désormais un
  attribut `data-pl-freshness` que les tests visent directement ;
- la page de secours hors ligne et le bandeau d'âge portaient tous deux un titre
  « Hors ligne ». La page devient « Écran non enregistré » : une page datée
  n'est pas une page absente, et deux titres identiques rendaient la navigation
  par titres ambiguë.

### DS-01 — livrables vérifiés

- **palette bleu-nuit à quatre fonds** (`canvas`, `surface`, `elevated`,
  `raised`) : la profondeur vient de la teinte et non d'ombres portées, qui ne
  se voient pas sur un fond aussi sombre ;
- **accent chartreuse** en remplacement du cuivre `#C87F4A`, qui n'était qu'à
  12 degrés de teinte de l'ambre d'avertissement `#E0A458` : « fais ceci » et
  « attention » se ressemblaient. Un test d'écart de teinte ferme la porte à
  une dérive du même genre — il échoue si l'ancienne valeur revient ;
- **contraste AA vérifié sur les quatre fonds** et non plus sur deux : les 36
  combinaisons texte/fond passent, la plus juste à 4.55:1 ;
- **primitives** `Card`, `Stat`, `Chip`, `Section`, `Button` et `ButtonLink`,
  avec tables de classes testées : cible tactile de 44 px garantie à toutes
  les tailles de bouton, aplat d'accent réservé à la variante primaire, ton
  défini pour chaque état ;
- **échelle de rayons alignée sur le système de design** : les cartes passent de
  16 à 20 px, les contrôles de 10 à 16 px, les pastilles deviennent des puces
  pleinement arrondies, et un rayon `xl` est ajouté pour le bloc dominant de
  l'accueil. `radius.test.ts` recopie les plages du système et refuse une
  dérive ;
- **chrome PWA et icônes alignés sur la palette** : `theme_color`,
  `background_color` et l'icône d'écran d'accueil restaient à l'ancien fond
  `#0B0E11`. Ce sont les seuls endroits où une couleur périmée reste visible
  sans qu'aucune capture de l'application ne la montre — la bande apparaît
  autour de la page, pas dedans. Le générateur d'icônes lit désormais
  `tokens.css` au lieu de recopier les hexadécimaux, et un test lie le
  manifeste au token ;
- **script de captures** `scripts/design-shots.mjs`, qui produit les paires
  AVANT / APRÈS de chaque lot sur 390×844, 430×932 et desktop.

Régression détectée et corrigée pendant le lot : la première version de `Card`
rendait toujours un `div`, ce qui supprimait silencieusement les repères
`<section>` des blocs Sauvegarde et Suppression. Les parcours E2E l'ont
attrapée ; `Card` accepte désormais la balise à rendre.

## Lot 10 — livrables vérifiés

- **audit fonctionnel complet** (`docs/audit-fonctionnel.md`) confrontant
  l'application aux exigences des documents de référence, parcours par parcours
  et écran par écran ;
- **modification d'une position** — parcours critique n° 10 de
  `QUALITY_GATES.md`, dont seule la suppression existait. L'instrument et le
  compte ne sont volontairement pas modifiables : les changer réécrirait le
  passé d'une position dont les points d'historique ont été calculés sur le
  titre d'origine ;
- cloisonnement de la modification vérifié sur PostgreSQL réel — un tiers ne
  modifie rien, un anonyme non plus, et la contrainte de quantité non nulle est
  appliquée par la base et pas seulement par le formulaire ;
- **référence obsolète corrigée** : l'écran d'ajout promettait la recherche par
  ISIN « au Lot 04 », un lot livré depuis longtemps — et bloqué. Un test E2E
  vérifie désormais qu'aucun numéro de lot n'atteint l'utilisateur ;
- **documentation d'installation et d'exploitation**, procédure iPhone comprise ;
- **matrice de compatibilité** énumérant explicitement ce qui n'a jamais été
  exécuté — Safari, Firefox, appareil physique, API réelle, déploiement ;
- **rapport de release** avec checklist RC 1.0 en 16 points ;
- **tag proposé, non créé** : `portfolio-lab-v1.0.0-rc.1`.

## Verdict de l'audit

**Release candidate, pas release.** Deux critères manquent :

1. **l'authentification n'est pas implémentée** — machine d'états et détection
   de configuration seulement. Brancher Supabase Auth demande un compte externe,
   et écrire le flux sans pouvoir l'exécuter produirait du code qui _paraît_
   intégré ;
2. **la validation visuelle par l'utilisateur** n'a pas eu lieu — elle ne peut
   pas l'être sans lui.

L'application ne doit donc pas être exposée publiquement. Pour un usage local
et personnel, avec une base PostgreSQL propre, elle est utilisable de bout en
bout.

## Preuves d'exécution — Lot 10

| Commande                                  | Résultat                               |
| ----------------------------------------- | -------------------------------------- |
| `pnpm run format:check`                   | tous les fichiers conformes            |
| `pnpm run lint`                           | 0 erreur, 0 avertissement              |
| `pnpm run typecheck`                      | 9 packages, 0 erreur                   |
| `pnpm run test:unit`                      | 632 tests — verts                      |
| `pnpm run test:integration`               | 169 tests — verts, sur PostgreSQL réel |
| `pnpm run build`                          | build de production réussi             |
| `pnpm run test:e2e` (sans données)        | 144 tests — verts                      |
| `pnpm run test:e2e` (portefeuille peuplé) | 325 verts, 75 ignorés                  |
| `pnpm audit --audit-level moderate`       | aucune vulnérabilité connue            |

## Lot 09 — livrables vérifiés

- **paquet `@portfolio-lab/security`** partagé par l'application web et la
  passerelle : la liste des secrets vivait dans la passerelle seule, et une
  liste dupliquée finit par diverger ;
- **journal expurgé sur deux axes** — secrets _par valeur_, et données
  financières ou personnelles _par nom de champ_ : « valorisation terminée :
  32 343.89 CHF » ne contient aucun secret et publie pourtant le patrimoine ;
- identifiants réduits à leur préfixe : un journal doit permettre de corréler,
  pas d'identifier ;
- contexte de journalisation limité aux **primitives** — accepter un objet
  reviendrait à journaliser tout ce qu'il contient ;
- **limitation de débit** à fenêtre glissante, horloge injectée, refus ne
  consommant pas de jeton, table bornée ; appliquée après authentification et
  sur l'identité, jamais sur l'adresse IP ;
- **ordre des refus corrigé** sur `/api/live-token` : la vérification du secret
  précédait l'authentification et renseignait un appelant anonyme sur la
  configuration du serveur ;
- **service worker réel** : réseau d'abord pour les pages, cache d'abord pour
  les fichiers empreintés, **aucune** route d'API mise en cache ;
- **bandeau hors ligne daté** : le rendu serveur inscrit son horodatage dans la
  page, et l'application annonce l'âge de ce qu'elle affiche ;
- page de secours `/hors-ligne` statique, pour un écran jamais consulté ;
- **sauvegarde** JSON versionnée, décimales en chaînes, sans aucun cours,
  servie par une route avec `Content-Disposition` et `no-store` ;
- **suppression définitive** avec mot à recopier, limite de débit, et
  **vérification a posteriori** : les lignes restantes sont comptées table par
  table et une suppression incomplète est signalée comme un échec ;
- cascade vérifiée sur PostgreSQL réel jusqu'aux transactions, maillon le plus
  profond ;
- `pnpm.overrides` corrigeant cinq vulnérabilités transitives, et un job CI
  `pnpm audit --audit-level moderate` ;
- **runbook de reprise** couvrant onze symptômes observables ;
- ADR 0009.

## Preuves d'exécution — Lot 09

| Commande                                  | Résultat                               |
| ----------------------------------------- | -------------------------------------- |
| `pnpm run format:check`                   | tous les fichiers conformes            |
| `pnpm run lint`                           | 0 erreur, 0 avertissement              |
| `pnpm run typecheck`                      | 9 packages, 0 erreur                   |
| `pnpm run test:unit`                      | 632 tests — verts                      |
| `pnpm run test:integration`               | 164 tests — verts, sur PostgreSQL réel |
| `pnpm run build`                          | build de production réussi             |
| `pnpm run test:e2e` (sans données)        | 144 tests — verts                      |
| `pnpm run test:e2e` (portefeuille peuplé) | 319 verts, 69 ignorés                  |
| `pnpm audit --audit-level moderate`       | aucune vulnérabilité connue            |

Les 69 ignorés sont les parcours de session, sans objet en mode démonstration,
et ceux qui dépendent du service worker — que `next dev` n'enregistre pas.

## Quatre défauts trouvés pendant le Lot 09

1. **Aucun composant client n'était hydraté en développement.** La politique de
   sécurité du contenu interdisait `'unsafe-eval'`, dont `next dev` a besoin
   pour ses source maps ; le navigateur refusait donc tout le bundle client.
   L'application s'affichait normalement — le rendu serveur suffit — et les
   formulaires continuaient de fonctionner par soumission native, ce qui
   masquait entièrement le problème, **y compris dans les parcours E2E de la
   voie démonstration**, qui tournent sur `next dev`. Corrigé, et gardé par deux
   tests : l'un vérifie que la production n'autorise jamais `eval`, l'autre
   qu'un composant purement client s'hydrate réellement.
2. **Le champ de confirmation de suppression pouvait se désynchroniser.** Avec
   `value={...}`, un collage — exactement ce qu'un utilisateur fait avec le mot
   affiché juste au-dessus — laissait le bouton inactif alors que le champ
   montrait le bon mot. Le champ est devenu non contrôlé.
3. **`/api/live-token` renseignait un appelant anonyme** sur l'état de
   configuration du serveur, en vérifiant son secret partagé avant
   d'authentifier.

4. **Le bandeau hors ligne dépendait de l'hydratation**, et disparaissait donc
   exactement quand il comptait. Une page servie depuis le cache est
   précisément la situation où le JavaScript client peut ne pas aboutir : la
   page s'affichait alors comme si elle était à jour.

   **Trouvé par la CI**, où le test échouait sur les quatre gabarits alors
   qu'il passait en local. Deux corrections successives, dont la première était
   insuffisante :

   - le service worker charge désormais les fichiers référencés par chaque page
     servie en ligne. Le navigateur télécharge les chunks pendant le _premier_
     chargement, avant que le service worker ne prenne le contrôle, puis les
     ressort de son propre cache HTTP sans jamais repasser par lui : ils
     n'atteignaient jamais son cache. Vérifié par mutation — sans ce
     réchauffement, ils sont toujours absents après quinze secondes ;
   - **mais cela ne suffisait pas** : la CI a échoué une seconde fois, chunks
     en cache. Le bandeau est donc **rendu par le serveur dans chaque page et
     révélé par CSS**, jamais monté par JavaScript. Le service worker inscrit
     `data-pl-offline="cache"` dans le HTML qu'il sert ; le veilleur client ne
     couvre plus que la coupure survenant page ouverte, en amélioration et non
     en garantie.

   Vérifié frontalement : un test charge la page **scripts désactivés** et
   exige que le bandeau soit visible, avec un contrôle négatif sur une page non
   marquée.

Un cinquième point, découvert en écrivant les tests : un contrôle de
débordement au niveau de la page ne voit rien d'un tableau coupé dans un
conteneur défilant, et mes premiers tests d'export saturaient ma propre limite
de débit — la limite fonctionnait, les tests étaient faux.

## Lot 08 — livrables vérifiés

- total CHF, P&L latent et journalier déjà livrés au Lot 03, désormais complétés
  par le **rendement calculé en décimal** : l'accueil passait par `Number`,
  réintroduisant l'erreur de flottant sur le chiffre le plus regardé de l'écran ;
- allocations par classe d'actifs, compte et devise (déjà livrées, conservées) ;
- **historique quotidien** dérivé des snapshots stockés : plusieurs points par
  jour sont prévus par `DATA_MODEL.md`, le dernier de chaque journée est retenu ;
- frontière des journées en `Europe/Zurich`, pas en UTC — un point pris à
  00 h 30 à Zurich appartient au bon jour ;
- **série non comparable jamais tracée** : versions du moteur ou devises de
  consolidation mêlées, l'écran explique au lieu d'afficher une courbe fausse ;
- axe horizontal **proportionnel aux dates**, repère visible par mesure réelle
  tant que la série reste courte ;
- courbe doublée d'un résumé textuel chiffré et d'un tableau de valeurs exactes ;
- **contribution au P&L** triée par ampleur, gains et pertes confondus ; part
  `null` — jamais `0 %` — quand le P&L total est nul ;
- **exposition des options par sous-jacent**, valeur de marché et notionnel
  rendus distinctement, sur le multiplicateur réellement enregistré ;
- contrat écarté et **signalé** — jamais compté à zéro — quand aucun cours ne le
  valorise, ou quand le cours reçu n'est pas dans la devise de son strike ;
- **réconciliation affichée**, en égalité décimale stricte, sans tolérance
  d'arrondi ;
- **empreinte des composants** (`components_hash`) couvrant valeurs, taux,
  horodatages, fournisseurs, fraîcheurs et positions non valorisées ;
- enregistrement d'un point sur action explicite, jamais sur simple affichage ;
- aucun point enregistré quand aucune position n'est valorisable — un patrimoine
  de zéro creuserait la courbe là où il n'y a qu'une absence de cours ;
- `snapshotRepository` : lecture cloisonnée par RLS, écriture idempotente au même
  instant, horodatage fourni par l'appelant et jamais lu d'une horloge interne ;
- états vides distincts : aucun point, un seul point, série non comparable ;
- ADR 0008 consignant ces décisions.

## Preuves d'exécution — Lot 08

| Commande                                  | Résultat                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm run format:check`                   | tous les fichiers conformes                                                   |
| `pnpm run lint`                           | 0 erreur, 0 avertissement                                                     |
| `pnpm run typecheck`                      | 8 packages, 0 erreur                                                          |
| `pnpm run test:unit`                      | 590 tests — verts                                                             |
| `pnpm run test:integration`               | 158 tests — verts, sur PostgreSQL réel                                        |
| `pnpm run build`                          | build de production réussi                                                    |
| `pnpm run test:e2e` (sans données)        | 84 tests — verts                                                              |
| `pnpm run test:e2e` (portefeuille peuplé) | 276 verts, 28 ignorés (parcours de session, sans objet en mode démonstration) |

66 tests portent spécifiquement sur ce lot : contributions au P&L, exposition
notionnelle, exclusion des contrats non valorisés ou de devise incohérente,
réduction de l'historique quotidien, comparabilité des séries, empreinte des
composants, réconciliation, cloisonnement RLS des snapshots.

Deux assertions ont été **vérifiées par mutation**, pour prouver qu'elles ne
sont pas vides : falsifier un total fait échouer la réconciliation, et élargir
le tableau des options fait échouer le contrôle de troncature (324 px masqués
détectés).

Trois défauts trouvés et corrigés pendant le lot :

1. **le notionnel était tronqué** à « CHF 17'800.0 » sur un écran de 390 px — un
   montant faux, pas un détail de mise en page. La devise est passée dans
   l'en-tête du tableau ; un contrôle E2E compare désormais la largeur de
   défilement du conteneur, le seul signal qu'une assertion sur le texte du DOM
   ne verrait pas ;
2. **les mois s'affichaient en allemand** (« Aug. ») : `NUMERIC_LOCALE` vaut
   `de-CH`, bon choix pour les nombres suisses mais pas pour les libellés d'une
   interface française. Les dates suivent maintenant `fr-CH` ;
3. **la courbe espaçait les points régulièrement**, faisant ressembler un trou de
   trois mois à un intervalle d'un jour. L'axe est devenu proportionnel aux
   dates.

## Lot 01 — livrables vérifiés

- workspace `pnpm` à 7 packages sous `projects/portfolio-lab/` ;
- `apps/web` : PWA Next.js 15 App Router, TypeScript strict, `typedRoutes` ;
- `apps/market-gateway` : processus Node autonome, configuration validée par
  Zod, journal expurgé, endpoint `/health` — aucune connexion fournisseur ;
- `packages/domain` : décimales exactes (`decimal.js`), devises fermées,
  énumérations de fraîcheur et de type de prix ;
- `packages/ui` : tokens obsidienne/cuivre, contraste AA vérifié par test,
  formatage monétaire suisse ;
- `packages/portfolio-engine`, `market-data`, `database` : frontières posées,
  contenu au lot correspondant ;
- navigation mobile à cinq onglets, `Ajouter` au centre ;
- manifeste PWA, icônes générées, `apple-touch-icon`, service worker minimal ;
- en-têtes de sécurité et `robots: noindex` ;
- `.env.example` documenté, aucun `.env` réel versionné ;
- CI GitHub : format, lint, typecheck, tests, build, E2E, scan de secrets ;
- ADR 0001 consignant les choix techniques.

## Lot 07 — livrables vérifiés

- symbole OSI construit et relu en arithmétique décimale exacte ; strike plus
  fin que le millième refusé plutôt qu'arrondi ; date d'échéance vérifiée comme
  réellement existante ;
- parcours guidé en cinq étapes, aucun contrat approchant jamais substitué ;
- strikes triés numériquement, pas lexicographiquement ;
- choix du mark auditable : méthode retenue **et** motifs ayant écarté les
  précédentes, tous traduits en français ;
- cinq situations écartant le midpoint : fourchette absente, inversée, à zéro,
  trop large, ou trop ancienne ;
- dernier prix conservé en dernier recours mais fraîcheur dégradée en `STALE`
  quoi qu'annonce le fournisseur ;
- échec explicite quand rien n'est exploitable, jamais de prix de repli ;
- multiplicateur non standard signalé avec mention du cas du split ;
- **aucune sensibilité calculée** — `parseGreeks` exige source et horodatage ;
- jours restants calendaires, contrat négociable le jour de son échéance ;
- chaîne de démonstration couvrant liquide, illiquide, sans cotation,
  multiplicateur ajusté et expiré.

## Preuves d'exécution — Lot 07

| Commande                                  | Résultat                               |
| ----------------------------------------- | -------------------------------------- |
| `pnpm run format:check`                   | tous les fichiers conformes            |
| `pnpm run lint`                           | 0 erreur, 0 avertissement              |
| `pnpm run typecheck`                      | 8 packages, 0 erreur                   |
| `pnpm run test:unit`                      | 540 tests — verts                      |
| `pnpm run test:integration`               | 147 tests — verts, sur PostgreSQL réel |
| `pnpm run build`                          | build de production réussi             |
| `pnpm run test:e2e` (sans données)        | 84 tests — verts                       |
| `pnpm run test:e2e` (portefeuille peuplé) | 244 tests — verts                      |

73 tests portent spécifiquement sur les options : encodage OSI en millièmes,
dates inexistantes, cascade de valorisation sur contrats liquide, illiquide et
expiré, refus de substitution, avertissements de contrat.

Défaut corrigé pendant le lot : l'identifiant interne `SPREAD_TOO_WIDE`
s'affichait à l'utilisateur au lieu de son libellé français.

## Lot 06 — livrables vérifiés

- calendrier de publication : fraîcheur calculée en **jours ouvrés**, tolérance
  dépendant de la fréquence déclarée du fonds, jours fériés fournis par
  l'appelant et non codés en dur ;
- état `FUTURE_DATED` distinct : une NAV datée dans le futur est une anomalie de
  la source, pas une donnée fraîche ;
- résolution par ISIN exclusive — aucune substitution de classe de parts
  voisine, ambiguïté remontée à l'utilisateur ;
- devise contredisant l'ISIN signalée comme `MISMATCH`, jamais acceptée ;
- migration `0003_fund_metadata.sql` : `fund_details` et `fund_nav_history`,
  avec date de valeur distincte de l'instant de récupération ;
- ingestion NAV programmée, l'échec d'un fonds n'interrompant pas les autres ;
- contrôles stricts : type de prix, devise, valeur positive, horodatage lisible ;
- écran Fonds affichant NAV, date de valeur, classe de parts, devise, fréquence
  et explication de l'état en jours ouvrés ;
- une NAV inexploitable laisse la position **non valorisée**, jamais remplacée
  par une valeur de repli.

## Preuves d'exécution — Lot 06

| Commande                                  | Résultat                               |
| ----------------------------------------- | -------------------------------------- |
| `pnpm run format:check`                   | tous les fichiers conformes            |
| `pnpm run lint`                           | 0 erreur, 0 avertissement              |
| `pnpm run typecheck`                      | 8 packages, 0 erreur                   |
| `pnpm run test:unit`                      | 467 tests — verts                      |
| `pnpm run test:integration`               | 147 tests — verts, sur PostgreSQL réel |
| `pnpm run build`                          | build de production réussi             |
| `pnpm run test:e2e` (sans données)        | 84 tests — verts                       |
| `pnpm run test:e2e` (portefeuille peuplé) | 192 tests — verts                      |

67 tests portent spécifiquement sur les fonds : calendrier de jours ouvrés,
week-ends, jours fériés, absence de publication, résolution par ISIN, refus de
substitution de classe de parts, contrôles d'ingestion.

Un défaut de formulation trouvé et corrigé : l'écran affichait « Publiée
aujourd'hui » pour une NAV du vendredi lue le dimanche — zéro jour ouvré écoulé,
mais pas une publication du jour.

## Lot 05 — livrables vérifiés

- passerelle WebSocket persistante, canal `/live` authentifié ;
- jetons HMAC-SHA256 de cinq minutes, comparaison en temps constant, signature
  vérifiée avant l'expiration ;
- jeton transporté par le sous-protocole WebSocket, jamais par l'URL ;
- déduplication des abonnements par comptage de références, période de grâce de
  30 secondes ;
- cache du dernier cours rejetant les messages hors ordre et les valeurs
  inchangées ;
- péremption par nature de donnée — une NAV n'est pas périmée après une heure,
  une saisie manuelle ne se périme jamais ;
- diffusion groupée toutes les 250 ms, chaque client ne recevant que ses
  symboles ;
- backoff exponentiel avec gigue et disjoncteur par fournisseur ;
- heartbeat et fermeture des connexions silencieuses ;
- route `/api/live-token` côté PWA, sans cache ;
- hook client avec reconnexion, et indicateur d'état visible en permanence ;
- `DEMO_INSTRUMENTS` partagé entre passerelle et seed.

## Preuves d'exécution — Lot 05

| Commande                                  | Résultat                                         |
| ----------------------------------------- | ------------------------------------------------ |
| `pnpm run format:check`                   | tous les fichiers conformes                      |
| `pnpm run lint`                           | 0 erreur, 0 avertissement                        |
| `pnpm run typecheck`                      | 8 packages, 0 erreur                             |
| `pnpm run test:unit`                      | 400 tests — verts                                |
| `pnpm run test:integration`               | 133 tests — verts, dont 17 sur de vraies sockets |
| `pnpm run build`                          | build de production réussi                       |
| `pnpm run test:e2e` (sans données)        | 84 tests — verts                                 |
| `pnpm run test:e2e` (portefeuille peuplé) | 164 tests — verts                                |

Vérification en conditions réelles : la passerelle a été démarrée, `/health` a
répondu `liveChannel: "ready"`, et un client WebSocket réel a reçu le message de
bienvenue puis des cours après abonnement. Aucun message ne contenait le secret
partagé.

**Un défaut trouvé par cette vérification** : la passerelle instanciait le
fournisseur simulé avec une liste d'instruments vide. Elle démarrait, se
déclarait prête, acceptait les connexions et ne résolvait jamais aucun symbole.
Aucun test unitaire ne pouvait le voir. Corrigé, et couvert par un test dédié.

## Lot 04 — livrables vérifiés

- contrat `MarketDataProvider` sans aucun type propre à un vendeur ;
- fournisseur simulé déterministe, plafonné à la fraîcheur `MANUAL` ;
- suite d'assertions de conformité partagée, exportée hors de l'entrée
  principale pour ne pas imposer `vitest` aux consommateurs du package ;
- registre avec statuts de vérification ordonnés
  `UNVERIFIED` → `FIXTURE_TESTED` → `SANDBOX_TESTED` → `PRODUCTION_TESTED` ;
- matrice de couverture : 19 instruments, 8 catégories, conforme aux minimums de
  `MARKET_DATA.md` (2 actions US, 3 actions CH/EU, 2 ETF US, 2 ETF EU/CH,
  3 fonds Pictet de classes distinctes, 2 autres fonds, 3 options US sur 2
  sous-jacents, USD/CHF et EUR/CHF) ;
- rapport reproductible en JSON et Markdown, vérifié par la CI ;
- écran d'état des fournisseurs dans Réglages ;
- guide d'intégration `docs/market-data-integration.md`.

## Blocage majeur du Lot 04

**Aucun fournisseur réel n'a pu être interrogé, ni même documenté.**

Deux causes cumulées :

1. aucune clé d'API n'a été fournie ;
2. l'accès réseau aux fournisseurs est refusé par la politique de sortie de
   l'environnement — `twelvedata.com`, `eodhd.com`, `massive.com` et
   `openfigi.com` sont tous bloqués, documentation comprise.

Conséquence assumée : **aucun adaptateur réel n'a été écrit**. En écrire un dans
ces conditions produirait du code qui paraît intégré et une matrice qui
rapporterait comme testé ce qui ne l'a jamais été.

**Aucune recommandation de fournisseur ne peut donc être formulée à ce stade.**
La procédure pour lever le blocage est dans `docs/market-data-integration.md`.

## Preuves d'exécution — Lot 04

| Commande                                  | Résultat                               |
| ----------------------------------------- | -------------------------------------- |
| `pnpm run format:check`                   | tous les fichiers conformes            |
| `pnpm run lint`                           | 0 erreur, 0 avertissement              |
| `pnpm run typecheck`                      | 8 packages, 0 erreur                   |
| `pnpm run test:unit`                      | 288 tests — verts                      |
| `pnpm run test:integration`               | 114 tests — verts, sur PostgreSQL réel |
| `pnpm run build`                          | build de production réussi             |
| `pnpm run coverage:matrix`                | 19 instruments × 5 fournisseurs        |
| `pnpm run test:e2e` (sans données)        | 84 tests — verts                       |
| `pnpm run test:e2e` (portefeuille peuplé) | 156 tests — verts                      |

Résultat de la matrice : fournisseur simulé 9 résolus / 10 introuvables ;
Twelve Data, Massive, EODHD et OpenFIGI **19 jamais interrogés** chacun.

## Lot 03 — livrables vérifiés

- `packages/portfolio-engine` : moteur pur, sans entrée/sortie ni horloge
  implicite ; valorisation, P&L latent, variation du jour, allocation ;
- une donnée manquante produit une **raison** et jamais un zéro ; les positions
  non valorisées sont exclues du total et annoncées à l'écran ;
- chargeur de fixtures validé, refusant toute donnée fictive marquée `LIVE` ;
- mode démonstration verrouillé : littéral exact requis, exception levée si
  `NODE_ENV=production`, bandeau permanent non masquable ;
- CRUD comptes et positions par actions serveur, identité revalidée côté serveur
  à chaque action ;
- écrans : tableau de bord, liste des positions, fiche détaillée avec provenance
  complète, formulaire d'ajout, analyse, réglages ;
- badges de fraîcheur sur chaque ligne, méthode de valorisation, fournisseur,
  horodatage, taux FX appliqué et version du moteur visibles.

## Preuves d'exécution — Lot 03

Node 22.22.2 / pnpm 10.4.1 / PostgreSQL 16.13 :

| Commande                                  | Résultat                               |
| ----------------------------------------- | -------------------------------------- |
| `pnpm run format:check`                   | tous les fichiers conformes            |
| `pnpm run lint`                           | 0 erreur, 0 avertissement              |
| `pnpm run typecheck`                      | 8 packages, 0 erreur                   |
| `pnpm run test:unit`                      | 230 tests — verts                      |
| `pnpm run test:integration`               | 114 tests — verts, sur PostgreSQL réel |
| `pnpm run build`                          | 7 routes, dont 6 dynamiques            |
| `pnpm run test:e2e` (sans données)        | 84 tests sur 4 tailles — verts         |
| `pnpm run test:e2e` (portefeuille peuplé) | 140 tests sur 4 tailles — verts        |

Total du portefeuille de démonstration : **32 343.8925 CHF**, vérifié à la main
dans `tests/integration/demo-valuation.test.ts` et à l'écran.

Deux défauts trouvés par les tests pendant ce lot et corrigés :

1. une conversion de devise identité dégradait la fraîcheur d'un fonds NAV en
   « Manuel » ;
2. sans session mais avec une base, l'accueil affichait « aucun placement
   enregistré » au lieu de signaler l'absence d'authentification.

## Lot 02 — livrables vérifiés

- migration `0001_initial_schema.sql` : 13 tables, 10 types énumérés, contraintes
  de validation et déclencheurs `updated_at` ;
- migration `0002_row_level_security.sql` : RLS activée **et forcée** sur les 13
  tables, quatre politiques par table utilisateur, lecture seule sur le
  référentiel de marché, aucune politique sur le journal d'exploitation ;
- validation ISIN en base, format **et** clé de contrôle Luhn ;
- déclencheurs de cohérence hiérarchique empêchant de rattacher une ressource au
  portefeuille d'un tiers ;
- runner de migrations avec empreinte SHA-256 et détection de dérive ;
- `packages/database` : configuration validée, client avec `numeric` préservé en
  chaîne, repositories typés, traduction d'erreurs sans fuite de détail SQL ;
- `apps/web/src/lib/auth` : résolution d'état de session à quatre cas, détection
  d'une clé `service_role` exposée au navigateur ;
- seed de démonstration entièrement fictif, **sans aucun cours** ;
- CI dotée d'un service PostgreSQL 16 réel, avec garde-fou contre un saut
  silencieux des tests RLS.

## Preuves d'exécution — Lot 02

Commandes réellement exécutées le 23 août 2026, sur Node 22.22.2 / pnpm 10.4.1 /
PostgreSQL 16.13 :

| Commande                    | Résultat                                          |
| --------------------------- | ------------------------------------------------- |
| `pnpm run format:check`     | tous les fichiers conformes                       |
| `pnpm run lint`             | 0 erreur, 0 avertissement                         |
| `pnpm run typecheck`        | 8 packages, 0 erreur                              |
| `pnpm run test:unit`        | 149 tests, 13 fichiers — verts                    |
| `pnpm run test:integration` | 99 tests, 6 fichiers — verts, sur PostgreSQL réel |
| `pnpm run build`            | build de production réussi                        |
| `pnpm run test:e2e`         | 84 tests sur 4 tailles d'écran — verts            |

Vérification de la qualité des tests RLS par mutation : remplacer
`using (user_id = current_user_id())` par `using (true)` sur `portfolios` fait
échouer 3 tests. Les assertions ne sont donc pas vides.

## Preuves d'exécution — Lot 01

Commandes réellement exécutées le 23 août 2026, sur Node 22.22.2 / pnpm 10.4.1 :

| Commande                    | Résultat                                              |
| --------------------------- | ----------------------------------------------------- |
| `pnpm install`              | 8 projets, lockfile généré                            |
| `pnpm run format:check`     | tous les fichiers conformes                           |
| `pnpm run lint`             | 0 erreur, 0 avertissement                             |
| `pnpm run typecheck`        | 7 packages, 0 erreur                                  |
| `pnpm run test:unit`        | 113 tests, 9 fichiers — verts                         |
| `pnpm run test:integration` | 23 tests, 2 fichiers — verts                          |
| `pnpm run build`            | 7 packages, 6 routes statiques, ~106 kB First Load JS |
| `pnpm run test:e2e`         | 60 tests sur 4 tailles d'écran — verts                |

Captures vérifiées en 390×844, 430×932, 768×1024 et 1280×900.

## Décisions actées

Décisions produit du Lot 00, inchangées :

- l'utilisateur ajoute lui-même toutes les positions ;
- aucune connexion à une banque ou un courtier ;
- CHF comme devise de consolidation ;
- actions/ETF/options live ou différés selon le fournisseur ;
- fonds valorisés avec leur dernière NAV ;
- architecture multi-fournisseurs ;
- clés uniquement côté serveur ;
- application privée, installable comme PWA ;
- style sombre obsidienne/cuivre.

Décisions techniques du Lot 01 (détail dans `docs/adr/0001-socle-technique.md`) :

- `decimal.js` en précision 34, arrondi bancaire, transport en `DecimalString` ;
- locale numérique `de-CH` avec interface française — `fr-CH` mélange point et
  virgule décimale entre devises et pourcentages ;
- Tailwind 4 relié aux tokens `--pl-*` par `@theme inline`, source unique
  vérifiée par test ;
- icônes PWA générées par script, comparées au pixel et non à l'octet ;
- Vitest en deux projets distincts `unit` et `integration`.

## Blocages connus

- aucun abonnement data ne doit être choisi avant le Lot 04 et la matrice de
  couverture ;
- aucune clé API réelle n'est disponible : les intégrations fournisseurs seront
  développées contre des fixtures et un fournisseur `mock` déterministe, et
  resteront explicitement marquées « en attente de clé » ;
- le dépôt porte encore le nom d'incubation `Bordel-Teste-`, même si le projet
  s'appelle PortfolioLab ;
- **aucun projet Supabase n'existe** : le schéma, les politiques et la résolution
  de session sont écrits et testés, mais le flux d'authentification réel
  (échange de cookie, rappel OAuth) n'est branché sur rien. L'interface l'annonce
  explicitement plutôt que de simuler une session.

## Journal

| Date       | Événement                            | Preuve                                           |
| ---------- | ------------------------------------ | ------------------------------------------------ |
| 2026-08-23 | Initialisation du dépôt d'incubation | commit initial README                            |
| 2026-08-23 | Création de la branche du skill      | `skill/portfolio-lab-master`                     |
| 2026-08-23 | Rédaction du Lot 00                  | fichiers de spécification et skill               |
| 2026-08-23 | Fusion du Lot 00 dans `main`         | PR #1                                            |
| 2026-08-23 | Lot 01 — fondation du workspace      | branche `claude/portfolio-lab-lot-01-foundation` |
