# Rapport de vérification — données de marché

Généré à la main à partir de `pnpm coverage:matrix`, `pnpm market:smoke` et de
la revue des adaptateurs. Chaque statut ci-dessous est **mesuré**, jamais
supposé.

## Verdict global

**Aucun fournisseur n'est PRODUCTION READY**, et aucun ne peut l'être depuis cet
environnement.

## Le blocage, énoncé d'abord

Tous les hôtes fournisseurs sont refusés par la politique de sortie réseau de
l'environnement d'exécution. Vérifié le 24 août 2026 :

| Hôte                 | Réponse                       |
| -------------------- | ----------------------------- |
| `eodhd.com`          | `403 — Host not in allowlist` |
| `api.twelvedata.com` | `403 — Host not in allowlist` |
| `api.coingecko.com`  | `403 — Host not in allowlist` |
| `api.openfigi.com`   | `403 — Host not in allowlist` |
| `api.massive.com`    | `403 — Host not in allowlist` |
| `www.finra.org`      | `403 — Host not in allowlist` |

Le corps de la réponse est celui de la passerelle d'egress, pas celui du
fournisseur. C'est une distinction qui a coûté deux corrections : un `403` de
passerelle est indiscernable d'un `403` fournisseur au niveau du code de statut,
et les deux outils — le script de vérification et la matrice — concluaient
« clé refusée » alors qu'aucune requête n'était sortie de la machine.

**Pour débloquer** : ajouter ces six hôtes aux réglages de sortie réseau de
l'environnement. Aucune autre action n'est requise côté code.

## Par fournisseur

| Fournisseur   | Statut                               | Ce qui manque                                     |
| ------------- | ------------------------------------ | ------------------------------------------------- |
| EODHD         | **FIXTURE READY**                    | accès réseau ; clé personnelle pour la recherche  |
| Twelve Data   | **FIXTURE READY**                    | accès réseau ; clé pour dépasser le mode démo     |
| CoinGecko     | **FIXTURE READY**                    | accès réseau uniquement — l'accès sans clé suffit |
| Massive       | **BLOCKED BY API KEY**               | clé obligatoire, aucun mode démo public           |
| OpenFIGI      | **UNSUPPORTED** comme source de prix | ne publie aucun cours, par conception             |
| FINRA TRACE   | **FIXTURE READY**                    | accès réseau ; adaptateur de transport à écrire   |
| Alpha Vantage | **UNSUPPORTED**                      | non implémenté                                    |
| Finnhub       | **UNSUPPORTED**                      | non implémenté                                    |
| FactSet       | **BLOCKED BY SUBSCRIPTION**          | abonnement institutionnel                         |

`FIXTURE READY` signifie : l'adaptateur existe, sa normalisation est testée sur
des charges utiles réalistes, et il s'instancie réellement dès qu'une clé ou un
mode démo est disponible. **Il n'a jamais parlé à l'API.** Écrire un client HTTP
ne prouve pas qu'il fonctionne.

## Par classe d'actifs

| Classe              | Couverture déclarée           | Statut             |
| ------------------- | ----------------------------- | ------------------ |
| Actions             | EODHD, Twelve Data, Massive   | FIXTURE READY      |
| ETF                 | EODHD, Twelve Data, Massive   | FIXTURE READY      |
| Fonds / NAV         | EODHD, Twelve Data            | FIXTURE READY      |
| Options             | Massive                       | BLOCKED BY API KEY |
| Crypto              | CoinGecko, EODHD, Twelve Data | FIXTURE READY      |
| FX                  | EODHD, Twelve Data            | FIXTURE READY      |
| Indices             | EODHD, Twelve Data, Massive   | FIXTURE READY      |
| Futures             | Massive                       | BLOCKED BY API KEY |
| Matières premières  | Twelve Data                   | FIXTURE READY      |
| Obligations         | FINRA TRACE                   | FIXTURE READY      |
| Cash                | aucun fournisseur requis      | PRODUCTION READY   |
| Produits structurés | aucun                         | UNSUPPORTED        |
| Actifs privés       | saisie manuelle               | PRODUCTION READY   |

Cash et actifs privés sont les deux seules lignes réellement en production :
elles ne dépendent d'aucun fournisseur.

## Résultat de `pnpm market:smoke`

4 tests sur 4 **BLOQUÉS**. Ni ÉCHEC ni OK : la requête n'atteint aucun
fournisseur. Le script sort en code 2 avec la mention « NON CONCLUANT », qui
dit exactement ce que vaut le résultat — rien sur l'état des fournisseurs, rien
sur la validité des clés.

## Résultat de `pnpm coverage:matrix`

| Fournisseur        | Cellules                                 |
| ------------------ | ---------------------------------------- |
| Fournisseur simulé | 9 `RESOLVED`, 10 `NOT_FOUND`             |
| Twelve Data        | 17 `UNSUPPORTED`, 2 `BLOCKED_BY_NETWORK` |
| EODHD              | 17 `UNSUPPORTED`, 2 `BLOCKED_BY_NETWORK` |
| CoinGecko          | 19 `UNSUPPORTED`                         |
| Massive            | 19 `NOT_RUN`                             |
| OpenFIGI           | 19 `NOT_RUN`                             |

Les `UNSUPPORTED` disent que le fournisseur ne déclare pas la classe d'actif ou
la recherche par ISIN — la plupart des instruments de la matrice sont désignés
par ISIN, que seul EODHD sait chercher, et seulement avec une clé personnelle.

Aucun `NOT_FOUND` n'apparaît chez un fournisseur réel, et c'est délibéré :
`NOT_FOUND` signifie « interrogé, introuvable », ce qui serait faux.

## Ce qui reste à faire quand l'accès existera

1. rejouer `pnpm market:smoke` et vérifier au moins un `OK` réel ;
2. rejouer `pnpm coverage:matrix` avec une clé EODHD personnelle pour la
   recherche par ISIN ;
3. confronter le format de fil des deux WebSocket à une vraie connexion — le
   parseur est isolé dans un module par fournisseur pour que la correction ne
   touche qu'un seul endroit ;
4. fournir les ISIN exacts des classes de parts Pictet, UBS et
   BlackRock/Amundi à tester. **Ils ne sont pas inventés ici** : une mauvaise
   classe de parts est un échec du test, pas une approximation acceptable ;
5. faire passer les fournisseurs éprouvés de `FIXTURE_TESTED` à
   `PRODUCTION_TESTED` dans `candidates.ts`, une fois — et seulement une fois —
   qu'un appel réel a abouti.
