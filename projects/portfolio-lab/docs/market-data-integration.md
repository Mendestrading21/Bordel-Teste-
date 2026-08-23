# Intégrer un fournisseur de données de marché

Ce document décrit exactement ce qu'il reste à faire pour brancher un
fournisseur réel. Il est écrit pour être suivi sans rien deviner.

## État actuel, sans détour

**Aucun fournisseur réel n'est intégré.** Les quatre candidats de
`references/MARKET_DATA.md` — Twelve Data, Massive, EODHD, OpenFIGI — sont
enregistrés avec le statut `UNVERIFIED` et un motif de blocage lisible par la
matrice de couverture et par l'écran d'état des fournisseurs.

Leur fonction `create` renvoie **toujours** `null`. Poser une clé d'API dans
l'environnement n'active donc rien : il n'existe aucun adaptateur à activer.

### Pourquoi aucun adaptateur n'a été écrit

Trois conditions manquent, et les trois sont nécessaires :

1. **Aucune clé d'API** n'a été fournie, et aucune ne doit être achetée sans
   décision explicite.
2. **L'accès réseau aux fournisseurs est bloqué** dans l'environnement de
   développement utilisé. Les domaines `twelvedata.com`, `eodhd.com`,
   `massive.com` et `openfigi.com` sont refusés par la politique de sortie.
   Aucun appel, même de documentation, n'a pu aboutir.
3. **Aucune capacité n'a donc pu être vérifiée officiellement** : ni le format
   de réponse, ni le délai réellement servi, ni la place de cotation retournée,
   ni les droits d'usage personnel.

Écrire un client HTTP dans ces conditions produirait du code qui _paraît_
intégré. La matrice le rapporterait comme testé alors qu'aucun appel n'aurait
jamais eu lieu — exactement ce que `SKILL.md` interdit. Le choix a donc été de
livrer le contrat, le fournisseur simulé, la matrice et l'outillage, et de
laisser les adaptateurs explicitement vides et signalés comme tels.

## Statuts de vérification

| Statut              | Signification                                                |
| ------------------- | ------------------------------------------------------------ |
| `UNVERIFIED`        | Aucun appel n'a jamais été fait                              |
| `FIXTURE_TESTED`    | Testé uniquement contre des fixtures locales                 |
| `SANDBOX_TESTED`    | Un appel a réellement abouti sur l'environnement de test     |
| `PRODUCTION_TESTED` | Un appel a réellement abouti en production, abonnement actif |

Un statut ne se monte **jamais** sans preuve d'exécution. Le registre ordonne
les fournisseurs par ce statut : un adaptateur jamais appelé ne passe pas devant
un adaptateur éprouvé.

## Procédure d'intégration

### 1. Vérifier officiellement les capacités

Avant d'écrire une ligne de code, obtenir de la documentation officielle du
fournisseur, pour chaque classe d'actifs visée :

- le type de données servi — temps réel, différé, dernière clôture, NAV ;
- le délai annoncé en minutes si les données sont différées ;
- les places de cotation couvertes ;
- la disponibilité de l'historique quotidien ;
- pour les options : la source du **multiplicateur** de contrat ;
- pour les fonds : la résolution par ISIN et la distinction des classes de parts ;
- les limites de débit et le coût de l'offre nécessaire ;
- les **droits d'usage personnel** — certains contrats interdisent l'affichage.

Reporter ces éléments dans `capabilities` de l'enregistrement. `bestFreshness`
doit refléter ce que **l'abonnement configuré** sert réellement, jamais ce que
l'offre la plus chère permettrait.

### 2. Implémenter l'adaptateur

Créer `packages/market-data/src/providers/<id>.ts` exposant un
`MarketDataProvider`. Contraintes non négociables :

- **aucun type propre au vendeur ne franchit le contrat** — si un objet de SDK
  fuit vers l'extérieur, le fournisseur cesse d'être remplaçable ;
- **le multiplicateur d'option se lit chez la source** — un adaptateur qui ne
  peut pas le lire doit échouer, jamais supposer 100 ;
- **les décimales restent des chaînes** de bout en bout ;
- **les erreurs sont normalisées** en `ProviderError` avec un `kind` de la
  taxonomie ;
- **aucune clé ne doit apparaître dans un message d'erreur ou un journal**.

### 3. Enregistrer des fixtures

Enregistrer de vraies réponses, réduites et expurgées de toute clé, dans
`tests/fixtures/providers/<id>/`. Ce sont ces fixtures qui font passer le statut
à `FIXTURE_TESTED`.

### 4. Passer la suite de conformité

L'adaptateur doit passer les mêmes assertions que tous les autres :

```ts
import {
  assertValidQuote,
  assertValidResolution,
  assertFreshnessWithinCapabilities,
} from "@portfolio-lab/market-data/testing";
```

Ainsi que les cas d'erreur listés dans `references/MARKET_DATA.md` : recherche
exacte et ambiguë, instrument non trouvé, quote partielle, devise inattendue,
horodatage invalide, limite de débit, erreur d'authentification, reconnexion,
doublon et événement hors ordre.

### 5. Ajouter la clé

```bash
# .env — jamais versionné
TWELVE_DATA_API_KEY=…
```

Les clés sont lues **uniquement** côté serveur : par `apps/market-gateway` pour
les flux, par les Route Handlers pour les appels ponctuels. Aucune ne doit
jamais être préfixée `NEXT_PUBLIC_`.

### 6. Exécuter la matrice

```bash
pnpm run coverage:matrix
```

Le rapport est écrit dans `docs/market-data/coverage-matrix.md` et
`coverage-matrix.json`. Les deux sont versionnés : c'est la trace qui justifie
le choix d'un fournisseur.

### 7. Monter le statut de vérification

Uniquement après une exécution réussie et observée. Consigner la date et la
sortie dans `STATUS.md`.

## Ce que la matrice ne dit pas encore

Le rapport actuel ne contient **aucune** conclusion sur les fournisseurs réels,
parce qu'aucun n'a été interrogé. Le seul résultat exploitable est que
l'outillage fonctionne : le fournisseur simulé résout 9 des 19 instruments et la
matrice signale correctement les 10 autres comme introuvables — preuve qu'elle
sait distinguer une lacune d'un succès.

Une recommandation de fournisseur ne pourra être formulée qu'après l'étape 6,
avec des clés et un accès réseau.
