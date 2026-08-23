# ADR 0003 — Moteur de valorisation et mode démonstration

- **Statut** : accepté
- **Date** : 2026-08-23
- **Lot** : 03

## Contexte

`DATA_MODEL.md` fixe les formules ; `MARKET_DATA.md` impose que le moteur ne
choisisse jamais un prix lui-même. Le Lot 03 doit produire un portefeuille
valorisable **sans aucun fournisseur réel**.

## Décisions

### Le moteur est pur et ne choisit jamais un prix

`packages/portfolio-engine` n'a aucune entrée/sortie, aucune horloge implicite,
aucun accès réseau. Toute donnée nécessaire est passée en argument : le résultat
est reproductible à l'octet près à partir de ses composants.

Le service de marché transmet `price`, `priceType` et `freshness` **déjà
déterminés** ; le moteur les propage. Le laisser retomber silencieusement sur une
clôture précédente masquerait la vraie nature de la donnée affichée.

### Une donnée manquante n'est jamais zéro

`valuePosition` renvoie une **raison** plutôt que des zéros : `NO_MARK`,
`MARK_UNAVAILABLE`, `NO_FX_RATE`, `COST_FX_MISSING`. Un zéro se propagerait dans
les totaux et ferait apparaître une baisse de patrimoine là où il n'y a qu'une
absence d'information. Les positions non valorisées sont listées à part et
l'interface les annonce explicitement.

De même, `dayPnlBase` vaut `null` et non `0` quand la clôture précédente manque —
zéro se lirait « stable aujourd'hui », ce qui est faux — et le total du jour
devient `null` dès qu'**une seule** position en manque : additionner les
variations connues donnerait un chiffre partiel présenté comme complet.

### Une conversion identité ne dégrade pas la fraîcheur

Découvert par les tests : `resolveFxRate("CHF", "CHF")` renvoyait une fraîcheur
`MANUAL`, qui l'emportait sur `NAV` dans `worseFreshness`. Un fonds libellé en
CHF, valorisé par sa NAV, s'affichait donc comme une saisie manuelle.

Une conversion identité renvoie désormais `freshness: null` — elle n'apporte
aucune donnée et laisse la fraîcheur du prix intacte. Pour un vrai taux, la
fraîcheur retenue reste la pire du couple : un prix en direct converti par un
taux de la veille n'est pas une valeur en direct.

### Devise du coût distincte de celle du prix

Un titre peut être acheté en USD et coté sur une place en EUR. Le coût est donc
converti avec le taux de **sa** devise ; réutiliser celui du prix fausserait le
P&L. Deux taux peuvent manquer indépendamment, d'où deux raisons distinctes.

### Pourcentages rapportés à des valeurs absolues

`unrealized_pnl_pct` divise par `abs(cost_basis)` : une position vendeuse a un
coût négatif, et diviser par lui inverserait le signe du rendement affiché.

Un coût nul donne `null`, jamais `0 %` : « aucun rendement calculable » et
« rendement de zéro » sont deux informations différentes.

L'allocation utilise l'exposition **brute** comme dénominateur : avec des
positions vendeuses, une somme algébrique proche de zéro produirait des parts
aberrantes, voire une division par zéro.

### Fraîcheur du portefeuille = la pire de ses positions

Annoncer « en direct » un total dont une ligne est une NAV de la veille serait un
mensonge par agrégation.

### Mode démonstration verrouillé

PortfolioLab doit être utilisable avant qu'un projet Supabase existe. Le mode
démonstration remplace donc l'authentification par un utilisateur fixe, mais :

- il exige `PORTFOLIO_LAB_DEMO_MODE=true` **littéral** — « 1 », « yes » ou
  « TRUE » ne suffisent pas ;
- il **lève une exception** si `NODE_ENV=production`. Échouer au démarrage est
  très préférable à servir des données sans authentification ;
- l'interface affiche un bandeau permanent et non masquable annonçant que toutes
  les données sont fictives.

Conséquence pratique : `next start` force `NODE_ENV=production`, donc les
parcours E2E avec données tournent sur le serveur de développement. Les autres
tournent sur le build de production, seule configuration où le service worker,
les en-têtes et le manifeste se comportent réellement.

### Aucun cours fictif ne peut se présenter comme un cours de marché

Les fixtures de démonstration portent `freshness: MANUAL` ou `NAV`, et le
chargeur valide sans réécrire. Un test vérifie qu'aucune entrée n'annonce `LIVE`
ni `DELAYED`, et un test E2E vérifie que le texte « En direct » n'apparaît
jamais à l'écran en mode démonstration.

### Distinction « déconnecté » / « portefeuille vide »

Trouvée en revue : avec une base mais sans session, l'accueil affichait « aucun
placement enregistré » à un utilisateur simplement déconnecté, qui pouvait croire
ses données perdues. `PortfolioView.authenticated` sépare désormais les deux
états, qui ont chacun leur écran.

### Saisie en `text`, jamais `number`

Les champs de montant utilisent `type="text"` avec `inputMode="decimal"` :
`type="number"` accepte la notation exponentielle, affiche des molettes et
normalise la valeur selon la locale du navigateur. La virgule décimale est
acceptée à la saisie et normalisée en point, sans jamais passer par un `number`.

## Conséquences

- Ajouter un cas de non-valorisation impose d'étendre `ValuationGap` et son
  libellé utilisateur : aucune lacune ne peut rester silencieuse.
- `next typegen` est appelé avant `tsc` dans le script `typecheck` de l'app web,
  sans quoi la CI échouerait sur les routes dynamiques typées, `typecheck`
  tournant avant `build`.
- Webpack reçoit un `extensionAlias` `.js → .ts` : les packages du workspace
  importent avec l'extension `.js`, exigée par `verbatimModuleSyntax`.

## Alternatives écartées

- **Valoriser à zéro les positions sans cours** : rend le total faux sans le
  dire. Rejeté.
- **Un mode démonstration sans garde-fou de production** : un déploiement mal
  configuré servirait les données sans authentification.
- **Fixtures marquées `LIVE` pour « tester le rendu live »** : rendrait
  indiscernables données réelles et inventées, ce que la spécification interdit.
