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

## 1 bis. Couvrir les places suisses, les fonds et les taux de change — EODHD

Finnhub gratuit ne sert ni les fonds, ni les options, ni les places suisses en
temps réel. Il ne sert pas non plus de taux de change, et sans taux, toute
position en devise étrangère reste **non valorisée** — c'est voulu : convertir
avec un taux inventé donnerait un total en francs plausible et faux.

EODHD comble les trois trous d'un coup.

1. Créer un compte sur <https://eodhd.com/register>.
2. Renseigner :

   ```
   EODHD_ENABLED=true
   EODHD_MODE=live
   EODHD_API_KEY=votre-clé
   ```

Sans clé, `EODHD_MODE=demo` utilise la clé publique `demo` officiellement
publiée par EODHD. Elle est limitée à une poignée de symboles et ne donne pas
accès à la recherche — assez pour prouver que le transport fonctionne, pas pour
valoriser un portefeuille.

Twelve Data joue le même rôle et sert aussi le FX :

```
TWELVE_DATA_ENABLED=true
TWELVE_DATA_MODE=live
TWELVE_DATA_API_KEY=votre-clé
```

Les deux peuvent coexister. Le routeur choisit par classe d'actifs et bascule
sur le suivant quand le premier échoue, en conservant la trace de qui a
réellement servi la donnée.

### Sans taux de change, rien n'est inventé

Quand aucun fournisseur ne sert de taux, les positions en devise étrangère
apparaissent **non valorisées**, avec leur motif. Elles ne sont pas converties
au taux d'hier, ni à 1. C'est le seul endroit du produit où une valeur absente
vaut franchement mieux qu'une valeur approchée : un total en francs faux ne se
distingue en rien d'un total juste.

## 1 ter. Votre accès — phrase secrète

Sans cette étape, l'application déployée reste **fermée** : elle refuse
d'afficher quoi que ce soit tant qu'aucune session n'est ouverte, et c'est
voulu — un suivi de patrimoine visible sans mot de passe n'est pas un suivi de
patrimoine.

Sur votre machine, dans le dossier du projet :

```bash
pnpm creer-acces
```

Le script demande une phrase secrète, deux fois, **sans l'afficher**. Il ne
l'enregistre nulle part et ne la transmet à personne : seule son empreinte
sort, et une empreinte ne se retourne pas en phrase.

Il produit trois lignes :

```
PORTFOLIO_LAB_OWNER_ID=…
PORTFOLIO_LAB_SESSION_SECRET=…
PORTFOLIO_LAB_PASSPHRASE_HASH=…
```

Copiez-les dans les variables d'environnement de l'hébergeur. **Jamais dans
Git.**

### Choisir la phrase

Quatre mots ordinaires valent mieux qu'un mot compliqué : plus long, plus
facile à retenir, et rien à noter sur un papier. Douze caractères minimum.

Notez-la dans votre gestionnaire de mots de passe **avant** de déployer :
personne ne peut la retrouver, pas même vous. Le serveur n'en garde que
l'empreinte.

### Ce que fait chaque valeur

| Variable | Rôle |
| --- | --- |
| `PORTFOLIO_LAB_OWNER_ID` | l'identifiant du propriétaire du portefeuille en base |
| `PORTFOLIO_LAB_SESSION_SECRET` | signe le cookie de session ; le changer déconnecte tout |
| `PORTFOLIO_LAB_PASSPHRASE_HASH` | l'empreinte de votre phrase ; jamais la phrase |

Changer `PORTFOLIO_LAB_OWNER_ID` révoque **toutes** les sessions d'un coup :
c'est le geste à faire si vous pensez qu'un appareil a été compromis.

### Pour changer de phrase

Relancez `pnpm creer-acces`, puis remplacez uniquement
`PORTFOLIO_LAB_PASSPHRASE_HASH`. Gardez les deux autres valeurs telles quelles :
changer `PORTFOLIO_LAB_OWNER_ID` vous couperait de vos propres données, qui
appartiennent en base à l'ancien identifiant.

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

## 3 bis. Vos premières lignes

Une base neuve ne contient **aucun instrument** : c'est normal, et l'écran
d'ajout le prend en compte. Il propose directement « Nouvel instrument » au
lieu d'un sélecteur vide.

Pour chaque titre que vous détenez :

1. **Nom** — celui qui vous parle. « Apple Inc », « Ma prévoyance 3a ».
2. **Classe** et **devise** — elles déterminent comment la ligne est valorisée
   et convertie.
3. **Identifiant pour les cours** — facultatif, mais c'est lui qui décide de
   tout :

| Identifiant | Ce qui se passe |
| --- | --- |
| Ticker, ISIN ou symbole fournisseur | le cours est cherché automatiquement |
| Aucun | le cours reste celui que vous saisissez, et l'écran le dit |

Le nom seul ne suffit jamais à désigner un titre. Chercher « AAPL » chez un
fournisseur renvoie aussi AAPU, AAPB et AAPD — des produits à effet de levier
qui ne sont pas Apple. C'est pourquoi l'application ne devine jamais : sans
identifiant, elle déclare la ligne non cotable au lieu d'aller chercher un
cours au hasard.

### Quel identifiant choisir

- **Ticker** pour une action ou un ETF, avec le code de place si le titre est
  coté ailleurs qu'aux États-Unis (`NESN` + `XSWX`).
- **ISIN** pour un fonds de placement, ou quand vous l'avez sous la main : il
  est mondialement unique, contrairement au ticker.
- **Symbole fournisseur** quand vous savez déjà comment votre fournisseur
  nomme le titre (`AAPL.US` chez EODHD). Le nom du fournisseur est alors
  obligatoire : un symbole propriétaire n'existe que dans son référentiel.

### Les biens sans cours

Un appartement, une part de société, un objet de collection : créez-les sans
identifiant, en classe « Autre ». Vous saisissez leur valeur, l'application la
consolide avec le reste et affiche « Manuel » — elle ne prétend jamais l'avoir
obtenue d'un marché.

## 4. Sur l'iPhone

1. Ouvrir l'adresse dans **Safari**. Chrome et Firefox sur iOS ne proposent pas
   l'installation : seul Safari le peut.
2. Toucher le bouton **Partager** (le carré avec la flèche vers le haut).
3. Faire défiler, puis **Sur l'écran d'accueil**.
4. Valider. L'icône apparaît parmi les applications.

Lancée depuis cette icône, l'application s'ouvre **en plein écran**, sans barre
d'adresse ni onglets. C'est un mode différent de celui du navigateur, et
plusieurs choses n'y sont visibles que là :

- le contenu passe **sous** l'heure et l'îlot dynamique, d'où les marges de
  zone sûre — vérifiées par un parcours automatisé qui simule un iPhone à
  encoche ;
- la barre de navigation basse laisse la place à la barre d'accueil ;
- l'orientation reste en portrait ;
- la barre d'état est claire sur fond sombre.

### Si l'icône apparaît blanche ou générique

Safari met les icônes en cache agressivement. Supprimer l'application de
l'écran d'accueil, fermer Safari, le rouvrir, recharger la page, puis
réinstaller.

### Ce que l'application fait sans réseau

Elle reste consultable : les écrans déjà visités sont servis depuis le cache, et
un bandeau annonce **de quand datent les chiffres affichés**. C'est la moitié
qui compte — savoir qu'on est hors ligne ne sert à rien si on ignore l'âge des
données.

Aucun cours n'est rafraîchi hors ligne, et rien ne prétend le contraire.

### Ce qu'elle ne fait pas

Elle **n'envoie aucune notification**. iOS les autorise pour les applications
installées depuis iOS 16.4, mais rien de tel n'est implémenté ici : la routine
du matin écrit dans Notion, elle ne fait pas sonner le téléphone. Si vous le
voulez, c'est un travail à part entière — dites-le-moi.

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

Avec Finnhub seul : les fonds de placement, les options, et toute position en
devise étrangère faute de taux de change.

Avec EODHD ou Twelve Data en plus : les fonds et le FX sont couverts. Restent
les **options**, qu'aucun des deux ne publie. Il faudrait Massive, dont
l'adaptateur existe déjà dans `packages/market-data/` mais qui n'offre aucun
mode démo — il exige une clé payante.

Restent aussi les **obligations**. Le module `finra-trace` sait normaliser une
transaction TRACE, mais il n'existe ni client HTTP ni entrée de routeur pour
aller la chercher : ce sont des fonctions, pas un fournisseur.
