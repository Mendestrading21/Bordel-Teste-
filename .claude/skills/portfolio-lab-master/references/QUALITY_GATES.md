# PortfolioLab — Qualité, sécurité et livraison

## Principes

- preuve avant affirmation ;
- tests déterministes ;
- erreurs visibles ;
- aucun secret ;
- aucun merge ou déploiement automatique ;
- priorité à l’exactitude financière sur les effets visuels.

## Scripts cibles

Le workspace doit converger vers :

```json
{
  "scripts": {
    "format": "...",
    "format:check": "...",
    "lint": "...",
    "typecheck": "...",
    "test": "...",
    "test:unit": "...",
    "test:integration": "...",
    "test:e2e": "...",
    "build": "..."
  }
}
```

Les implémentations exactes dépendent du scaffold. Les commandes racine doivent orchestrer tous les packages.

## Tests unitaires prioritaires

### Calculs

- valeur action/ETF/fonds ;
- multiplicateur option ;
- conversion CHF ;
- P&L latent ;
- P&L journalier ;
- taux manquant ou périmé ;
- quantité négative ;
- zéro et très grandes valeurs ;
- arrondis d’affichage sans modifier la valeur métier.

### Marché

- sélection LAST/MID/NAV ;
- quote plus ancienne ignorée ;
- statut live/différé/EOD/NAV/périmé ;
- mapping par ISIN ;
- contrat option exact ;
- spread invalide ;
- reconnexion et déduplication.

## Tests d’intégration

- migrations depuis une base vide ;
- RLS et isolation utilisateur ;
- création compte → position → quote → valorisation ;
- changement FX → recalcul ;
- import de fixture fournisseur ;
- snapshot quotidien idempotent ;
- suppression en cascade contrôlée.

## Tests E2E

Parcours critiques :

1. authentification ;
2. création d’un compte ;
3. ajout d’une action ;
4. ajout d’un fonds par ISIN ;
5. ajout d’une option guidée ;
6. réception d’un tick simulé ;
7. consultation du dashboard ;
8. affichage d’une donnée périmée ;
9. redémarrage hors ligne avec dernier état ;
10. modification et suppression d’une position.

Tailles minimales : 390×844, 430×932 et desktop.

## Fixtures

- aucune API réelle dans la CI standard ;
- réponses fournisseurs stockées comme fixtures réduites et anonymisées ;
- horloge contrôlable ;
- fuseau et jours de marché déterministes ;
- données de test clairement fictives ;
- tests live séparés, manuels et ignorés par défaut.

## Sécurité

### Secrets

- `.env*` ignorés sauf `.env.example` ;
- scan de secrets en CI ;
- aucun token dans logs, erreurs ou captures ;
- rotation documentée en cas d’exposition ;
- clés service uniquement côté serveur.

### Application

- validation Zod aux frontières ;
- authentification sur API et canal live ;
- RLS ;
- limitation de débit ;
- protection CSRF selon l’architecture ;
- en-têtes de sécurité ;
- dépendances auditées ;
- erreurs utilisateur séparées des détails internes.

### Finance

- aucune route d’ordre ;
- aucune permission de trading ;
- aucune recommandation personnalisée générée par l’application ;
- source et fraîcheur obligatoires ;
- impossibilité de confondre données fictives et réelles.

## Revue visuelle

Pour toute PR UI :

- captures mobile et desktop ;
- état normal, chargement, vide, erreur et périmé ;
- vérification du contraste ;
- navigation clavier ;
- `prefers-reduced-motion` ;
- absence de débordement horizontal principal.

## Git et PR

Nom de branche :

```text
claude/portfolio-lab-lot-XX-description
```

Commits recommandés :

```text
feat(portfolio-lab): ...
test(portfolio-lab): ...
fix(portfolio-lab): ...
docs(portfolio-lab): ...
chore(portfolio-lab): ...
```

La Pull Request reste brouillon jusqu’à validation des critères. Elle contient :

- contexte ;
- périmètre ;
- changements ;
- tests exécutés avec résultat ;
- captures ;
- migrations ;
- risques et limites ;
- procédure de rollback ;
- checklist sécurité.

## Interdictions

- ne pas fusionner ;
- ne pas activer auto-merge ;
- ne pas déployer ;
- ne pas acheter un abonnement ;
- ne pas ajouter une clé réelle ;
- ne pas déclarer un test « vert » sans sortie observée ;
- ne pas masquer une limitation fournisseur avec une valeur fictive.

## Definition of Done

- critères du lot satisfaits ;
- lint, typecheck, tests et build verts ;
- migrations reproductibles ;
- couverture des cas d’erreur ;
- revue mobile ;
- statut mis à jour ;
- branche poussée ;
- PR brouillon ouverte ;
- aucune fusion ni production.
