# ADR 0006 — Fonds de placement et valeur nette d'inventaire

- **Statut** : accepté
- **Date** : 2026-08-23
- **Lot** : 06

## Contexte

`MARKET_DATA.md` fixe cinq règles pour les fonds : résoudre d'abord par ISIN,
vérifier la classe de parts et la devise, utiliser la dernière NAV publiée et sa
date, ne jamais interpoler une NAV intraday, et tenir compte des week-ends,
jours fériés et fréquences de publication avant de marquer `STALE`.

Ces règles n'ont pas d'équivalent pour les titres cotés, et les ignorer produit
des erreurs particulièrement pernicieuses.

## Décisions

### La fraîcheur d'une NAV se calcule en jours ouvrés

C'est le cœur de ce lot. Un fonds dont la dernière NAV date de vendredi n'est
**pas** en retard le samedi, ni le dimanche, ni le lundi de Pâques. Appliquer un
seuil en heures ferait clignoter « donnée périmée » sur tout le portefeuille
chaque week-end, et l'utilisateur cesserait de prêter attention au signal —
exactement ce qu'il ne faut pas.

La tolérance dépend de la **fréquence de publication déclarée** : trois jours
ouvrés pour un fonds quotidien, vingt-six pour un mensuel. Le même écart de
trente jours périme un fonds quotidien et laisse un mensuel parfaitement à jour.

### Les jours fériés sont fournis, jamais codés en dur

Les calendriers diffèrent par place de cotation et par pays de domiciliation, et
une liste figée deviendrait fausse l'année suivante sans que personne ne s'en
aperçoive. L'appelant fournit son calendrier ; le module n'en suppose aucun.

### Une NAV datée dans le futur est une anomalie, pas une donnée fraîche

`FUTURE_DATED` est un état distinct. L'afficher comme à jour masquerait un
défaut de la source, et la position serait valorisée sur une valeur qui n'existe
pas encore.

### L'ISIN fait foi, et l'ambiguïté remonte à l'utilisateur

Le risque propre aux fonds est unique dans le produit : « Pictet - Water P EUR »
et « Pictet - Water I EUR » ne diffèrent que par une lettre, et leurs NAV
s'écartent de plusieurs pourcents. Confondre les deux ne produit pas une erreur
visible — cela produit un portefeuille dont la valeur est **plausible mais
fausse, durablement**.

`resolveFundCandidate` est donc volontairement peu « intelligent » :

- avec un ISIN demandé, seul un candidat portant **exactement** cet ISIN est
  accepté. Le « plus proche » est refusé ;
- plusieurs correspondances exactes restent ambiguës — cas d'un fonds coté sur
  plusieurs places ;
- sans ISIN, deux candidats ou plus sont ambigus. On ne devine jamais.

`parseShareClass` est explicitement **indicatif** : il sert à afficher et à
alerter, jamais à choisir. Les conventions de nommage varient d'un émetteur à
l'autre, et une heuristique qui trancherait finirait par se tromper sur un fonds
au nommage inhabituel.

### Devise contredisant l'ISIN : une anomalie signalée

Un ISIN juste avec une devise différente n'est pas un choix à faire
silencieusement — c'est très probablement une autre classe de parts, ou une
erreur de la source. `MISMATCH` est un état distinct de `RESOLVED`.

### La NAV a sa propre table

`fund_nav_history` est séparée de `daily_price_history` : une NAV porte une
**date de valeur**, pas une séance de bourse, et n'a ni ouverture, ni haut, ni
bas. Les mélanger ferait apparaître des fonds dans des calculs réservés aux
titres cotés.

La clé primaire inclut le fournisseur : comparer deux sources sur une même date
de valeur est légitime, et l'unicité par `(instrument, date, fournisseur)`
empêche les doublons sans interdire cette comparaison.

### Date de valeur et instant de récupération sont deux colonnes

Un fonds publie une NAV « du 21 » qui peut n'être disponible que le 23. C'est la
**date de valeur** qui détermine la fraîcheur ; l'instant de récupération sert au
diagnostic. Les confondre ferait paraître fraîche une NAV ancienne récupérée à
l'instant.

### L'ingestion est un travail périodique, pas une souscription

Un fonds ne se souscrit pas : sa valeur est publiée une fois par période, et il
n'existe aucun flux à écouter. Mélanger l'ingestion NAV au canal temps réel
ferait apparaître les fonds comme des instruments cotés en continu.

L'échec d'un fonds n'interrompt pas les autres : un portefeuille de dix fonds
dont un seul pose problème doit rester valorisé à neuf, avec la lacune signalée.

### Les contrôles d'ingestion sont stricts

Une NAV est la **seule** source de valeur d'un fonds. Accepter une valeur
douteuse produirait un portefeuille plausible mais faux, sans rien pour le
signaler. Sont donc refusés : un `priceType` autre que `NAV`, une devise
différente de celle attendue, une valeur nulle ou négative, un horodatage
illisible.

Un fonds valorisé par un « dernier échange » signale une confusion d'instrument,
pas une donnée de moindre qualité.

### Une NAV inexploitable n'est jamais remplacée

Si la NAV d'un fonds est `UNAVAILABLE`, la position apparaît comme **non
valorisée** plutôt que valorisée par une valeur de repli. C'est l'état réel, et
le moteur du Lot 03 sait déjà l'exposer sans fausser les totaux.

## Un défaut de formulation corrigé

L'écran affichait « Publiée aujourd'hui » pour une NAV datée du vendredi lue le
dimanche : zéro jour **ouvré** s'était écoulé, mais la NAV n'avait évidemment pas
été publiée ce jour-là. La formulation masquait précisément le raisonnement que
l'écran cherche à expliquer. Elle dit désormais « aucun jour ouvré ne s'est
écoulé depuis sa date de valeur ».

## Conséquences

- Ajouter une classe de parts d'un fonds déjà suivi exige son ISIN propre ; c'est
  volontairement contraignant.
- L'écran Fonds est atteint depuis Analyse et non par un sixième onglet :
  `UX_UI.md` fixe cinq onglets, et un de plus réduirait chaque cible tactile en
  dessous du confort sur un écran de 390 px.
- Les fonds ne peuvent structurellement pas afficher `LIVE` ni `DELAYED` ; un
  test le verrouille.

## Alternatives écartées

- **Seuil de péremption en heures** : ferait clignoter « périmé » chaque
  week-end, jusqu'à ce que le signal soit ignoré.
- **Résolution par nom approché** : produirait un portefeuille plausible mais
  faux, et durablement.
- **NAV dans `daily_price_history`** : ferait entrer les fonds dans des calculs
  réservés aux titres cotés.
- **Interpolation intraday d'une NAV** : explicitement interdite par la
  spécification, et fabriquerait une valeur que personne n'a publiée.
