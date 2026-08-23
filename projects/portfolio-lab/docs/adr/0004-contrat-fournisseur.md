# ADR 0004 — Contrat fournisseur et matrice de couverture

- **Statut** : accepté
- **Date** : 2026-08-23
- **Lot** : 04

## Contexte

`MARKET_DATA.md` impose une couche d'adaptateurs, une matrice de couverture
exécutée sur des instruments représentatifs, et l'interdiction de choisir un
fournisseur sur une promesse marketing.

Deux conditions manquaient au moment de ce lot :

1. **aucune clé d'API** n'a été fournie ;
2. **l'accès réseau aux fournisseurs est bloqué** par la politique de sortie de
   l'environnement — `twelvedata.com`, `eodhd.com`, `massive.com` et
   `openfigi.com` répondent tous par un refus au niveau du proxy. Même leur
   documentation est inaccessible.

## Décisions

### Aucun adaptateur réel n'est écrit

C'est la décision structurante de ce lot, et elle est délibérée.

Écrire un client HTTP contre une API dont on ne peut vérifier ni le format de
réponse, ni le niveau de fraîcheur réellement servi, ni les droits d'usage,
produirait du code qui _paraît_ intégré. La matrice le rapporterait comme testé
alors qu'aucun appel n'aurait jamais eu lieu.

Les quatre candidats sont donc enregistrés avec `verification: "UNVERIFIED"`, un
`blockedBy` explicite, et une fonction `create` qui renvoie **toujours** `null`.
Poser une clé dans l'environnement n'active rien : il n'y a rien à activer. Un
test le vérifie.

### `NOT_RUN` n'est pas `NOT_FOUND`

La distinction est au cœur du rapport. Un fournisseur jamais interrogé n'a pas
« échoué à trouver » un instrument. Les confondre transformerait une lacune de
vérification en conclusion — précisément l'erreur que la matrice existe pour
éviter.

Le rapport Markdown consacre une ligne de sa légende à ce point.

### Statuts de vérification ordonnés

`UNVERIFIED` → `FIXTURE_TESTED` → `SANDBOX_TESTED` → `PRODUCTION_TESTED`.

Le registre trie les fournisseurs par ce statut : un adaptateur jamais appelé ne
passe jamais devant un adaptateur éprouvé pour la même classe d'actifs.

### Capacités déclarées, jamais devinées

`bestFreshness` reflète ce que **l'abonnement configuré** sert réellement. Tant
qu'aucune mesure n'existe, les candidats sont déclarés au plus à `DELAYED` :
supposer `LIVE` reviendrait à croire une plaquette commerciale, et l'interface
afficherait « en direct » une donnée qui ne l'est pas. Un test le vérifie pour
les quatre candidats.

OpenFIGI est déclaré `bestFreshness: "UNAVAILABLE"` : c'est un service de
normalisation d'identifiants, pas une source de prix. Le déclarer autrement
l'exposerait à être choisi comme fournisseur de cours.

### Le multiplicateur d'option n'a pas de valeur par défaut

`OptionContractDetails.multiplier` est obligatoire. Un adaptateur incapable de le
lire chez la source doit échouer. Un contrat ajusté après un split ne vaut pas
100, et l'erreur porterait sur un facteur entier.

La matrice compare le multiplicateur lu au multiplicateur attendu et signale
tout écart.

### Suite de conformité partagée, hors entrée principale

Les assertions de conformité vivent dans `@portfolio-lab/market-data/testing`,
et non dans l'entrée principale : `contract-suite` importe `vitest`, et le
laisser dans `index.ts` forcerait l'application web et les scripts d'outillage à
charger le harnais de test. Le défaut a été trouvé en exécutant le script de
matrice, qui plantait au chargement.

### Fournisseur simulé plafonné à `MANUAL`

Sa meilleure fraîcheur déclarée est `MANUAL`, ce qui rend structurellement
impossible d'afficher une donnée simulée comme « en direct ». Ses prix sont
dérivés du symbole par hachage : déterministes d'une exécution à l'autre, mais
différents d'un instrument à l'autre — une constante partagée ferait passer des
tests par coïncidence.

### Rapport reproductible et versionné

L'horodatage du rapport est injecté, jamais lu de l'horloge système. La CI
régénère la matrice et échoue si le rapport versionné diffère : un rapport
obsolète justifierait un choix de fournisseur sur des résultats périmés.

## Conséquences

- **Aucune recommandation de fournisseur n'est formulée à ce lot**, et ce serait
  malhonnête de le faire : le seul résultat exploitable est que l'outillage
  fonctionne — le fournisseur simulé résout 9 des 19 instruments et la matrice
  signale correctement les 10 autres.
- L'écran de réglages affiche les quatre candidats en « jamais appelé ». Les
  masquer donnerait l'impression d'une couverture complète.
- `docs/market-data-integration.md` décrit la procédure complète, étape par
  étape, pour lever le blocage.

## Alternatives écartées

- **Écrire les adaptateurs d'après la mémoire des API publiques** : produirait
  des fixtures inventées et des tests qui ne prouvent rien de l'API réelle, avec
  l'apparence du contraire.
- **Marquer les fournisseurs non interrogés comme `NOT_FOUND`** : transformerait
  une absence de test en constat de non-couverture.
- **Activer un adaptateur dès qu'une clé est présente** : donnerait une
  application cassée au premier ajout de clé, au lieu d'un message clair.
