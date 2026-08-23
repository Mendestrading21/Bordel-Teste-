# PortfolioLab — Roadmap d’implémentation

## Règle générale

Un appel `execute` traite un seul lot. Ne pas enchaîner plusieurs lots sans demande explicite. Chaque lot se termine par tests, mise à jour du statut, commit, push et Pull Request brouillon.

## Lot 00 — Spécification et skill

**Statut initial : réalisé sur la branche de spécification.**

Livrables :

- skill maître ;
- spécification produit ;
- architecture ;
- stratégie données de marché ;
- modèle de données ;
- UX ;
- qualité ;
- README et STATUS.

Acceptation : les contraintes sont cohérentes et aucun code produit n’est prétendu terminé.

## Lot 01 — Fondation du workspace

Objectif : créer un socle exécutable sans fournisseur réel.

Livrables :

- workspace pnpm sous `projects/portfolio-lab/` ;
- `apps/web`, `apps/market-gateway` et packages ;
- TypeScript strict, formatage, lint, tests et build ;
- PWA shell installable ;
- design tokens obsidienne/cuivre ;
- page d’accueil vide et navigation mobile ;
- `.env.example` ;
- CI GitHub minimale.

Acceptation : installation propre, tous les scripts passent, PWA démarre et aucun secret n’existe.

## Lot 02 — Authentification et base

Objectif : accès privé et modèle persistant.

Livrables :

- Supabase local/configuration ;
- migrations initiales ;
- Auth privée ;
- RLS ;
- repositories typés ;
- seed de démonstration fictif ;
- tests des politiques et migrations.

Acceptation : un utilisateur authentifié voit uniquement ses données ; un accès anonyme échoue.

## Lot 03 — Comptes et positions manuelles

Objectif : créer le portefeuille sans données de marché réelles.

Livrables :

- CRUD portefeuilles et comptes ;
- ajout manuel d’un instrument/position ;
- quantité, coût moyen, devise, notes ;
- moteur de valorisation avec quotes fictives déterministes ;
- listes et fiches position ;
- tests unitaires des calculs.

Acceptation : l’utilisateur peut créer plusieurs comptes et obtenir un total CHF reproductible avec fixtures.

## Lot 04 — Résolution d’instruments et matrice de couverture

Objectif : prouver la couverture avant de choisir les abonnements.

Livrables :

- contrat `MarketDataProvider` ;
- adaptateurs de recherche candidats derrière feature flags ;
- recherche nom/ticker/ISIN ;
- normalisation des identifiants ;
- script de matrice de couverture ;
- rapport comparatif ;
- aucune clé dans Git.

Acceptation : le rapport teste les instruments représentatifs et recommande les fournisseurs par classe d’actifs avec preuves.

## Lot 05 — Actions, ETF et FX live

Objectif : faire bouger les cours cotés dans l’application.

Livrables :

- première intégration fournisseur validée ;
- passerelle WebSocket persistante ;
- authentification du canal client ;
- abonnements dédupliqués ;
- normalisation quotes et FX ;
- badges live/différé/périmé ;
- reconnexion et cache dernier cours ;
- fixtures et tests de contrat.

Acceptation : un tick fournisseur reçu met à jour une position sans rechargement et sans exposer la clé.

## Lot 06 — Fonds et NAV

Objectif : intégrer les fonds traditionnels proprement.

Livrables :

- recherche prioritaire par ISIN ;
- vérification classe de parts/devise ;
- ingestion programmée de NAV ;
- date et fréquence de NAV ;
- statut NAV/périmé ;
- écran fonds ;
- tests week-end, jour férié et absence de publication.

Acceptation : chaque fonds couvert affiche la bonne classe, la bonne devise, la dernière NAV et sa date.

## Lot 07 — Options

Objectif : ajouter et valoriser des contrats exacts.

Livrables :

- recherche sous-jacent ;
- chaîne échéance/strike/call-put ;
- mapping contrat canonique ;
- quotes bid/ask/last ;
- mark explicite ;
- multiplicateur ;
- échéance et jours restants ;
- Greeks seulement si sourcés ;
- tests de contrats liquides, illiquides et expirés.

Acceptation : une option sélectionnée correspond exactement au contrat du fournisseur et sa valorisation indique la méthode.

## Lot 08 — Dashboard et analyse

Objectif : livrer la vision patrimoniale complète.

Livrables :

- total CHF ;
- P&L latent et journalier ;
- allocation type/compte/devise ;
- historique quotidien ;
- contribution au P&L ;
- exposition options par sous-jacent ;
- graphiques accessibles ;
- états vides et erreur.

Acceptation : tous les agrégats se réconcilient avec les positions et les taux stockés.

## Lot 09 — Fiabilité, PWA et sécurité

Objectif : préparer une version personnelle stable.

Livrables :

- offline last-known-data ;
- service worker et stratégie cache ;
- sauvegarde/export ;
- suppression des données ;
- observabilité expurgée ;
- rate limiting ;
- audit dépendances ;
- tests E2E mobiles ;
- runbook de reprise.

Acceptation : l’application se dégrade proprement hors ligne, ne fuit aucun secret et passe l’audit de sécurité prévu.

## Lot 10 — Release candidate 1.0

Objectif : validation finale sans déploiement automatique.

Livrables :

- audit fonctionnel complet ;
- correction des écarts critiques ;
- données de démonstration séparées des données réelles ;
- documentation installation/exploitation ;
- matrice de compatibilité ;
- rapport de release ;
- tag proposé mais non créé sans validation.

Acceptation : tous les parcours critiques passent, la couverture marché réelle est documentée et l’utilisateur valide visuellement avant mise en production.
