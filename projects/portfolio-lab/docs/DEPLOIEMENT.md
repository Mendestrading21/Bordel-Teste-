# Mettre PortfolioLab en ligne

Objectif : une adresse à vous, ouvrable depuis l'iPhone, avec des cours réels.

Trois comptes gratuits suffisent. Comptez un quart d'heure.

---

## Pourquoi un hébergement est nécessaire

Une page publiée — un artefact, un fichier HTML isolé — ne peut appeler **aucun**
fournisseur de cours. La politique de sécurité de ces pages bloque tout hôte
externe : Finnhub, Yahoo, Google, sans exception, et aucune bibliothèque ni
aucun dépôt ne contourne ce blocage, qui est du côté de la page.

Un **serveur**, lui, appelle qui il veut. C'est la seule raison pour laquelle
cette étape existe.

Au passage, c'est aussi ce qui garde la clé d'API hors du navigateur : elle
reste sur le serveur, et le navigateur ne reçoit jamais que des cours déjà
normalisés.

---

## 1. La clé de cours — Finnhub

1. Créer un compte sur <https://finnhub.io/register>.
2. Copier la clé affichée sur le tableau de bord.
3. Renseigner **deux** variables d'environnement, pas une :

   ```
   FINNHUB_ENABLED=true
   FINNHUB_API_KEY=votre-clé
   ```

   `FINNHUB_ENABLED` est indispensable : sans elle, la clé est ignorée et aucun
   cours n'arrive, sans le moindre message d'erreur.

4. Facultatif, et seulement si vous souscrivez un plan payant :

   ```
   FINNHUB_PLAN=paid
   ```

   Le plan n'est jamais déduit de la clé — une clé gratuite et une clé payante
   se ressemblent trait pour trait, et en déduire « temps réel » afficherait
   « en direct » sur du différé.

Ce que le plan gratuit couvre réellement :

| Classe                         | Couverture      |
| ------------------------------ | --------------- |
| Actions américaines            | oui, temps réel |
| ETF américains                 | oui, temps réel |
| Actions suisses et européennes | différé         |
| Fonds de placement             | **non**         |
| Options                        | **non**         |

Les lignes non couvertes restent en saisie manuelle et l'écran le dit — il ne
prétend jamais avoir un cours qu'il n'a pas.

## 2. La base — Supabase

1. Créer un projet sur <https://supabase.com> (offre gratuite).
2. Dans **SQL Editor**, exécuter dans l'ordre les quatre fichiers de
   `supabase/migrations/`, puis `supabase/seed.sql` si vous voulez le jeu de
   démonstration.
3. Relever dans **Settings → Database** la chaîne de connexion, et dans
   **Settings → API** l'URL du projet et la clé `anon`.

## 3. L'hébergement — Vercel

1. Sur <https://vercel.com>, importer le dépôt GitHub.
2. Régler **Root Directory** sur `projects/portfolio-lab`.
3. Renseigner les variables d'environnement :

   | Variable                        | Valeur                               |
   | ------------------------------- | ------------------------------------ |
   | `DATABASE_URL`                  | la chaîne de connexion Supabase      |
   | `NEXT_PUBLIC_SUPABASE_URL`      | l'URL du projet Supabase             |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé `anon`                        |
   | `FINNHUB_API_KEY`               | votre clé Finnhub                    |
   | `FINNHUB_ENABLED`               | `true`                               |
   | `FINNHUB_PLAN`                  | `free`, ou `paid` si vous souscrivez |
   | `MARKET_DATA_MODE`              | `live`                               |
   | `MARKET_DATA_ENABLED_PROVIDERS` | `finnhub`                            |

4. Déployer.

`FINNHUB_API_KEY` n'est **jamais** préfixée `NEXT_PUBLIC_` : ce préfixe
enverrait la clé dans le navigateur, où n'importe quel visiteur la lirait.

## 4. Sur l'iPhone

Ouvrir l'adresse dans **Safari** — Chrome iOS ne propose pas l'installation —
puis **Partager → Sur l'écran d'accueil**.

---

## Vérifier que les cours arrivent vraiment

Ouvrir **Réglages → Données de marché**. Finnhub doit y apparaître comme
interrogeable, et la clé attendue marquée « présente dans l'environnement ».

Puis ouvrir **Positions**. Sous le compteur de lignes, une phrase d'état dit
exactement ce qui s'est passé :

| Ce qui s'affiche                        | Ce que ça veut dire                             |
| --------------------------------------- | ----------------------------------------------- |
| « 4 cours à jour à 09:12 — source : … » | les cours arrivent réellement                   |
| « Aucun fournisseur … n'est configuré » | `FINNHUB_ENABLED` ou la clé manque              |
| « 2 sans cours (…) »                    | ces lignes ne sont pas couvertes, et le motif suit |

Les lignes cotées affichent en plus leur cours unitaire avec son propre badge de
fraîcheur. S'il affiche « Manuel », le cours vient de votre saisie et non du
fournisseur — l'écran ne maquille jamais l'un en l'autre.

### Chaque instrument doit porter un identifiant

Un instrument sans ligne dans `instrument_identifiers` n'est **jamais** résolu
par son nom : il apparaît comme « sans cours », avec ce motif. C'est délibéré.
Chercher `AAPL` chez un fournisseur renvoie aussi `AAPU`, `AAPB`, `AAPD`, des
produits à levier qui ne sont pas Apple ; deviner reviendrait à valoriser un
portefeuille avec le cours d'un autre titre.

Une option se désigne par son symbole OSI et par rien d'autre. Sans OSI, elle
reste en saisie manuelle — se rabattre sur le ticker du sous-jacent donnerait le
cours de l'action au lieu de celui du contrat.

## Ce qui reste en saisie manuelle

Fonds de placement et options, que Finnhub ne sert pas sur ce plan. Pour les
couvrir, il faut un fournisseur qui les publie — EODHD pour les fonds, Massive
pour les options ; les deux adaptateurs existent déjà dans
`packages/market-data/`, il ne leur manque qu'une clé et la variable
correspondante dans `.env.example`.
