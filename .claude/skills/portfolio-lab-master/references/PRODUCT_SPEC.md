# PortfolioLab — Spécification produit

## Vision

PortfolioLab est un agrégateur patrimonial personnel, privé et strictement en lecture seule. L’utilisateur construit lui-même son portefeuille dans l’application ; PortfolioLab récupère ensuite les cours de marché disponibles, convertit les valeurs en CHF et présente une vision consolidée simple.

## Problème résolu

Les investissements sont répartis entre plusieurs établissements et plusieurs classes d’actifs. Consulter chaque plateforme donne une vision fragmentée. PortfolioLab offre un écran unique sans nécessiter d’accès bancaire.

## Utilisateur cible

Un utilisateur unique, propriétaire de l’application et de ses données.

## Objectifs V1

- ajout manuel d’actions, ETF, options et fonds de placement ;
- comptes et plateformes utilisés uniquement comme étiquettes d’organisation ;
- recherche par nom, ticker ou ISIN ;
- sélection guidée des options ;
- cours live ou différés pour les instruments cotés selon l’abonnement ;
- dernière NAV publiée pour les fonds traditionnels ;
- conversion automatique en CHF ;
- valorisation, P&L latent, variation journalière et allocation ;
- historique quotidien du patrimoine ;
- PWA privée installable sur iPhone ;
- transparence complète sur la source et la fraîcheur des données.

## Hors périmètre V1

- connexion à UBS, BCGE, Swissquote, IBKR ou une autre institution ;
- import automatique de portefeuille ou de transactions ;
- saisie d’ordres ou trading ;
- conseil financier ou signaux d’investissement ;
- fiscalité et déclaration d’impôts ;
- publication App Store ;
- produit SaaS public ou gestion de plusieurs clients ;
- données inventées pour combler une absence de couverture.

## Classes d’actifs

| Type | Ajout | Prix attendu | Particularités |
|---|---|---|---|
| Action | nom/ticker/ISIN | live, différé ou dernier disponible | place de cotation et devise obligatoires |
| ETF | nom/ticker/ISIN | live, différé ou dernier disponible | traité comme instrument coté |
| Option | sous-jacent → échéance → strike → call/put | bid/ask/last live ou différé | contrat canonique et multiplicateur |
| Fonds de placement | nom ou ISIN | dernière NAV publiée | classe de parts et date de NAV |
| Cash | devise et montant | taux FX | valeur fixe dans la devise native |
| Autre | libellé manuel | valeur manuelle | clairement marqué `MANUAL` |

Les obligations, produits structurés, cryptos et actifs privés pourront être ajoutés après V1 via la même architecture extensible.

## Objets visibles par l’utilisateur

### Portefeuille

Regroupe plusieurs comptes et définit la devise de référence, CHF par défaut.

### Compte

Étiquette libre telle que `Swissquote Actions`, `IBKR Options`, `BCGE Fonds` ou `UBS`. Aucun identifiant bancaire n’est nécessaire.

### Position

Instrument, compte, quantité, coût moyen, devise du coût, date d’acquisition optionnelle et notes optionnelles.

### Cours

Prix, devise, source, horodatage, niveau de fraîcheur et méthode de valorisation.

## Écrans V1

### 1. Accueil

- patrimoine total en CHF ;
- variation du jour en CHF et en pourcentage ;
- P&L latent ;
- capital investi ;
- répartition par classe d’actifs ;
- principales positions ;
- heure de dernière mise à jour.

### 2. Positions

- recherche et filtres par compte, type, devise et performance ;
- valeur native et CHF ;
- cours et variation ;
- badge de fraîcheur ;
- tri par valeur, P&L ou variation.

### 3. Ajouter

Flux principal :

1. choisir ou rechercher le type d’instrument ;
2. rechercher par nom, ticker ou ISIN ;
3. sélectionner l’instrument exact ;
4. saisir compte, quantité et coût moyen ;
5. prévisualiser la valorisation ;
6. confirmer.

Flux option :

1. rechercher le sous-jacent ;
2. choisir call ou put ;
3. choisir l’échéance ;
4. choisir le strike ;
5. vérifier le symbole du contrat, le multiplicateur et la devise ;
6. saisir le nombre de contrats et la prime moyenne.

### 4. Détail position

- identité complète de l’instrument ;
- valeur, coût et P&L ;
- cours, bid, ask, précédent close selon disponibilité ;
- graphique historique ;
- compte et notes ;
- source et fraîcheur ;
- modification ou suppression de la position.

Pour les options : échéance, strike, call/put, jours restants, multiplicateur et Greeks uniquement si disponibles et correctement sourcés.

Pour les fonds : ISIN, classe de parts, devise, dernière NAV et date de publication.

### 5. Analyse

- allocation par classe d’actifs, compte et devise ;
- évolution du patrimoine ;
- contribution au P&L ;
- exposition par sous-jacent pour les options.

### 6. Réglages et données

- devise de référence ;
- comptes ;
- statut des fournisseurs ;
- source active par classe d’actifs ;
- données périmées ou introuvables ;
- export et suppression des données.

## États obligatoires

Chaque écran doit concevoir explicitement :

- chargement ;
- aucun résultat ;
- erreur réseau ;
- instrument non couvert ;
- marché fermé ;
- cours différé ;
- NAV en attente ;
- donnée périmée ;
- mode hors-ligne ;
- authentification expirée.

## Critères de succès V1

- une nouvelle position standard peut être ajoutée en moins d’une minute ;
- aucune clé de marché n’est visible dans le navigateur ;
- un changement de cours reçu par la passerelle est visible sans rechargement manuel ;
- un fonds affiche sa NAV et sa date, jamais un faux flux live ;
- le total CHF est reproductible à partir des positions, prix et taux FX stockés ;
- une donnée obsolète est immédiatement identifiable ;
- l’application reste utilisable avec les derniers prix connus hors connexion.
