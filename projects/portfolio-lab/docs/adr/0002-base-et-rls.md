# ADR 0002 — Base de données, migrations et Row Level Security

- **Statut** : accepté
- **Date** : 2026-08-23
- **Lot** : 02

## Contexte

`DATA_MODEL.md` fixe les tables et les types ; `ARCHITECTURE.md` impose RLS
« même pour un utilisateur unique ». Cet ADR consigne comment ces contraintes
sont réalisées et testées.

## Décisions

### RLS activée ET forcée, sur toutes les tables

`enable row level security` ne suffit pas : le rôle **propriétaire** des tables —
celui sous lequel tournent les migrations — échappe aux politiques sans
`force row level security`. C'est l'exception la plus facile à oublier, donc
elle est posée sur chaque table et vérifiée par un test qui lit
`pg_class.relforcerowsecurity`.

La raison d'être de RLS ici n'est pas le multi-tenant : c'est que la clé `anon`
de Supabase part dans le bundle du navigateur. Sans politique, elle donne un
accès total à quiconque la lit.

### Une politique par commande, jamais `for all`

`using` filtre les lignes visibles, `with check` contrôle les lignes écrites.
Une politique `for all` avec un seul `using` laisse `with check` retomber
implicitement dessus, ce qui masque l'intention. Quatre politiques explicites
par table rendent l'omission visible — et un test vérifie que les quatre
commandes sont couvertes.

### `current_user_id()` plutôt que `auth.uid()` direct

La fonction essaie `auth.uid()` puis retombe sur le paramètre de session
`portfolio_lab.user_id`. Le schéma reste ainsi applicable et **testable** sur un
PostgreSQL nu, sans le schéma `auth` de Supabase — condition nécessaire pour que
la CI vérifie réellement les politiques plutôt que de les simuler.

Elle est `security definer` avec un `search_path` figé : sans cela, un appelant
pourrait créer son propre schéma `auth` et détourner la résolution d'identité.

### Déclencheurs de cohérence hiérarchique

RLS empêche de lire ou d'écrire la donnée d'autrui, mais **n'empêche pas** de
rattacher sa propre position au portefeuille d'un tiers dont l'identifiant
serait deviné. Les déclencheurs `assert_same_owner` ferment cette faille au
niveau de l'intégrité, là où une clé étrangère seule ne suffit pas.

### `user_id` dénormalisé sur chaque table

Même quand le lien pourrait être déduit par jointure. Une politique RLS reposant
sur une sous-requête est plus lente et plus facile à casser lors d'une
refactorisation du schéma.

### `numeric(30, 12)`, jamais de flottant

18 chiffres pour la partie entière, 12 décimales. Un test parcourt
`information_schema.columns` et échoue si une colonne `double precision` ou
`real` apparaît : un seul flottant suffirait à rendre un total faux.

Le pilote `pg` est reconfiguré pour rendre les `numeric` et les `int8` en
**chaîne** : sa conversion par défaut vers `number` détruirait silencieusement
la précision de chaque montant lu.

### Runner de migrations maison

Fichiers `NNNN_nom.sql`, appliqués une fois, dans l'ordre, chacun dans sa propre
transaction. L'empreinte SHA-256 de chaque fichier appliqué est conservée :
modifier une migration déjà passée est **détecté et refusé**, pas silencieusement
ignoré.

Pas de rollback automatique, volontairement : une migration défaite
automatiquement en production peut détruire des données.

### Le seed n'insère aucun cours

Un prix de démonstration en base serait indiscernable d'un prix réel dans
l'interface. Les instruments fictifs portent des ISIN de code pays `XX` — jamais
attribué à un émetteur réel — avec une clé de contrôle Luhn valide pour franchir
la contrainte. Un test vérifie que tous les ISIN du seed commencent par `XX` et
que `current_quotes`, `daily_price_history` et `fx_rates` restent vides.

### Validation ISIN en base

`is_valid_isin()` vérifie le format **et** la clé de contrôle Luhn. Contrôler
seulement le format laisserait passer une faute de frappe, qui serait ensuite
envoyée telle quelle à un fournisseur et pourrait résoudre un **autre**
instrument.

## Conséquences

- Les tests d'intégration exigent un vrai PostgreSQL. Sans lui, ils s'ignorent —
  mais un garde-fou fait échouer la CI dans ce cas, pour qu'un saut silencieux
  ne passe jamais pour une vérification réussie.
- Chaque suite de tests reçoit sa propre base, recréée à neuf : Vitest exécute
  les fichiers en parallèle, et deux suites recréant le même schéma entreraient
  en collision.
- Ajouter une table oblige à décider de sa politique : un test énumère les
  tables publiques et échoue sur toute table non classée.

## Alternatives écartées

- **Filtrer `user_id` dans chaque requête en plus de RLS** : donnerait l'illusion
  que RLS est facultative et masquerait une politique manquante lors des tests.
- **Drizzle ou Prisma** : leur valeur est le typage des requêtes, que les
  repositories couvrent ici à moindre coût. Leur gestion de migrations aurait en
  revanche masqué le contrôle fin exigé sur RLS et les contraintes.
- **PGlite pour les tests** : plus rapide à démarrer, mais ce n'est pas le moteur
  de production. Une politique RLS doit être vérifiée par PostgreSQL lui-même.
