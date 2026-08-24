# Rapport de vérification — données de marché

Généré à la main à partir de `pnpm coverage:matrix`, `pnpm market:smoke` et de
la revue des adaptateurs. Chaque statut ci-dessous est **mesuré**, jamais
supposé.

## Verdict global

**Aucun fournisseur n'est PRODUCTION READY.**

Deux ont néanmoins été **réellement contactés** depuis la CI, et ont répondu :
tous deux réclament une clé personnelle que la clé `demo` publique ne remplace
pas. Le transport fonctionne donc ; c'est l'autorisation qui manque.

## Deux environnements, deux résultats — et c'est l'essentiel

### Ici : réseau entièrement bloqué

Tous les hôtes fournisseurs sont refusés par la politique de sortie réseau de
l'environnement de développement. Vérifié le 24 août 2026 pour `eodhd.com`,
`api.twelvedata.com`, `api.coingecko.com`, `api.openfigi.com`,
`api.massive.com` et `www.finra.org` : `403 — Host not in allowlist`.

Le corps de la réponse est celui de la passerelle d'egress, pas celui du
fournisseur. La distinction a coûté deux corrections : un `403` de passerelle
est indiscernable d'un `403` fournisseur au niveau du code de statut, et les
deux outils concluaient « clé refusée » alors qu'aucune requête n'était sortie
de la machine.

### En CI : les fournisseurs répondent réellement

Le runner GitHub Actions, lui, a un accès réseau. **La matrice y a obtenu de
vraies réponses**, et c'est la première preuve de contact de tout ce chantier :

| Fournisseur | Réponse réelle observée en CI                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Twelve Data | `401` — « The 'demo' API key is only used for initial familiarity. To become a full user, you can request your own API key at https://twelvedata.com/pricing. It is absolutely free » |
| EODHD       | `403` — « Forbidden. Please contact support@eodhistoricaldata.com »                                                                                                                   |

Deux enseignements.

D'abord, **la clé `demo` ne suffit pas** chez ces deux fournisseurs pour les
endpoints utilisés par la matrice. Twelve Data l'annonce explicitement et offre
une clé personnelle gratuite ; EODHD refuse le FX à sa clé de démonstration.

Ensuite, et c'est ce qui valide la mécanique : `isEgressBlocked` **ne s'est pas
déclenché** sur ces réponses. Le classificateur a correctement rangé un vrai
refus de fournisseur en `PLAN_REQUIRED`, là où il range un blocage réseau en
`BLOCKED_BY_NETWORK`. Les deux sens sont désormais éprouvés sur des données
réelles, et non seulement sur fixtures.

**Pour débloquer le développement local** : ajouter ces six hôtes aux réglages
de sortie réseau de l'environnement. Aucune action côté code.

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

1. obtenir une clé Twelve Data personnelle — elle est gratuite, et le
   fournisseur l'annonce lui-même dans sa réponse ;
2. obtenir une clé EODHD personnelle : la clé `demo` ne couvre ni la recherche
   ni le FX ;
3. rejouer `pnpm market:smoke` et `pnpm coverage:matrix` depuis un
   environnement disposant du réseau — la CI en est un — et vérifier au moins
   un `OK` réel ;
4. confronter le format de fil des deux WebSocket à une vraie connexion — le
   parseur est isolé dans un module par fournisseur pour que la correction ne
   touche qu'un seul endroit ;
5. fournir les ISIN exacts des classes de parts Pictet, UBS et
   BlackRock/Amundi à tester. **Ils ne sont pas inventés ici** : une mauvaise
   classe de parts est un échec du test, pas une approximation acceptable ;
6. faire passer les fournisseurs éprouvés de `FIXTURE_TESTED` à
   `PRODUCTION_TESTED` dans `candidates.ts`, une fois — et seulement une fois —
   qu'un appel réel a abouti.
