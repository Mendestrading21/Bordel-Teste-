# ADR 0001 — Socle technique du workspace

- **Statut** : accepté
- **Date** : 2026-08-23
- **Lot** : 01

## Contexte

`references/ARCHITECTURE.md` fixe les grandes lignes (TypeScript strict, pnpm
workspaces, Next.js, PostgreSQL/Supabase, Zod, décimales exactes, Playwright,
Vitest, Tailwind) mais laisse volontairement les versions et les détails
d'assemblage au scaffold. Cet ADR consigne les choix effectivement retenus.

## Décisions

### Gestionnaire de paquets et structure

`pnpm` en workspace, racine du workspace placée dans `projects/portfolio-lab/`
et non à la racine du dépôt. Le dépôt est un incubateur multi-projets : y
installer un workspace global forcerait chaque autre projet à partager les
dépendances et la configuration de PortfolioLab.

### Décimales : `decimal.js`

Précision 34 chiffres (équivalent decimal128), arrondi `ROUND_HALF_EVEN`
(arrondi bancaire). La bibliothèque est mature, sans dépendance et suffisamment
rapide pour les volumes d'un portefeuille personnel.

Les valeurs circulent en `DecimalString`, un `string` marqué, et non en `number`.
La conversion n'a lieu qu'au moment du calcul et du rendu. `decimal()` refuse
délibérément un `number` en entrée : l'accepter réintroduirait l'erreur
flottante que tout le package cherche à éviter.

### Locale numérique : `de-CH`, avec une interface en français

Les données ICU de `fr-CH` sont incohérentes : la devise sort en `1 234.50`
(point décimal) alors que les pourcentages sortent en `1,23%` (virgule
décimale). Une valeur et sa variation apparaîtraient donc avec deux conventions
différentes sur le même écran.

`de-CH` est cohérent — `CHF 1'234.50`, `+1.23%` — et correspond à la convention
des établissements financiers suisses, apostrophe de milliers comprise. Seule la
mise en forme des nombres suit cette locale ; tous les libellés restent en
français. Un test d'invariant échoue si une locale mélangeant deux conventions
est réintroduite.

### Next.js 15, App Router, `typedRoutes`

`typedRoutes` valide chaque `href` à la compilation. Le coût est réel — les
tableaux de routes doivent porter des types littéraux — mais il supprime une
classe entière de liens morts.

### Tailwind CSS 4 relié aux tokens par `@theme inline`

`packages/ui/src/tokens.css` reste la source unique des valeurs ; `@theme inline`
relie les utilitaires Tailwind aux variables `--pl-*` sans les dupliquer. Un test
compare `tokens.css` et `tokens.ts` et échoue si les deux divergent.

### Vitest en deux projets

`unit` (logique pure) et `integration` (socket local, système de fichiers, plus
tard PostgreSQL). La séparation donne un sens réel à `test:unit` et
`test:integration` dès le Lot 01, plutôt que deux alias de la même commande.

### Icônes PWA générées par script

`scripts/generate-icons.mjs` encode les PNG avec `zlib`, sans dépendance. Les
icônes restent reproductibles et vérifiables : un test les régénère et compare
les **pixels**, pas les octets — la sortie de `deflate` varie selon la version de
zlib, le rendu visuel non.

### Passerelle de marché : processus HTTP autonome

`apps/market-gateway` démarre au Lot 01 avec une configuration validée par Zod,
un journal expurgé et un endpoint `/health`. Aucune connexion fournisseur n'est
ouverte : elles arrivent au Lot 05. Le processus existe dès maintenant pour que
la frontière « les clés vivent ici, jamais dans le navigateur » soit matérialisée
avant qu'une clé existe.

## Conséquences

- Les montants ne peuvent pas être manipulés accidentellement en `number` :
  `DecimalString` est un type marqué et ESLint interdit `parseFloat`.
- Ajouter une devise est un changement explicite, la liste étant fermée.
- Changer de locale numérique casse un test dédié, ce qui force à reconsidérer
  l'incohérence documentée ici.

## Alternatives écartées

- **`big.js`** : plus léger mais sans contrôle fin de l'arrondi ni de la
  précision globale.
- **Entiers en centimes** : insuffisant pour les quantités fractionnaires de
  fonds et les prix à plusieurs décimales.
- **Turborepo** : `pnpm -r` suffit pour sept packages ; à reconsidérer si les
  temps de build deviennent gênants.
