# ADR 0009 — Fiabilité hors ligne, expurgation et limitation de débit

- **Statut** : accepté
- **Date** : 2026-08-23
- **Lot** : 09

## Contexte

`ROADMAP.md` demande pour ce lot : données de dernier recours hors ligne,
stratégie de cache, sauvegarde et export, suppression des données,
observabilité expurgée, limitation de débit, audit des dépendances, tests E2E
mobiles et runbook de reprise. Le critère d'acceptation : l'application se
dégrade proprement hors ligne, ne fuit aucun secret, et passe l'audit de
sécurité prévu.

## Décisions

### Le réseau d'abord pour les pages, le cache seulement en secours

Une page en cache est un patrimoine daté. La servir alors que le réseau répond
ferait lire des chiffres périmés sans raison. Le service worker ne consulte donc
le cache qu'après un échec réseau.

Et quand il le fait, l'application le **dit** : le rendu serveur inscrit son
horodatage dans la page, et un bandeau annonce l'âge de ce qui est affiché.
Sans cette moitié-là, le cache hors ligne serait un mensonge silencieux — c'est
elle qui rend le mécanisme acceptable, pas le cache lui-même.

Les routes d'API ne sont jamais mises en cache. Un jeton de canal rejoué depuis
un cache, ou une sauvegarde périmée servie silencieusement, seraient tous deux
pires qu'une erreur franche.

### Un journal expurge deux choses, pas une

L'expurgation habituelle vise les secrets. Pour une application patrimoniale,
elle est insuffisante : « valorisation terminée : 32 343.89 CHF » ne contient
aucun secret et publie pourtant le patrimoine de l'utilisateur.

Le journal expurge donc aussi les **données financières et personnelles**, par
nom de champ comparé en sous-chaîne — `marketValueBase`, `average_cost`,
`totalUnrealizedPnlBase` sont attrapés sans être énumérés. Un faux positif rend
un journal moins précis ; un faux négatif publie un patrimoine.

Les identifiants sont réduits à leur préfixe : un journal doit permettre de
**corréler** deux lignes, pas d'identifier une personne ni de rapprocher un log
d'une ligne de base.

Le contexte n'accepte que des **primitives**. Ce n'est pas une limitation
d'implémentation : accepter un objet arbitraire — une position, une réponse
fournisseur — reviendrait à journaliser tout ce qu'il contient, et c'est
précisément par là qu'un patrimoine finit dans un fichier.

Le tout vit dans `@portfolio-lab/security`, partagé par l'application web et la
passerelle. La liste des secrets était auparavant maintenue dans la passerelle
seule ; une liste dupliquée finit par diverger, et c'est l'endroit oublié qui
laisse fuir la clé.

### La limitation de débit est locale, et le dit

Le compteur vit dans le processus. Deux instances derrière un répartiteur
comptent séparément. Pour une application personnelle mono-instance c'est
suffisant, et l'écrire vaut mieux que laisser croire à une garantie globale.

Fenêtre **glissante**, pas fixe : une fenêtre fixe laisse passer deux fois la
limite à cheval sur une frontière. L'horloge est un paramètre — un limiteur qui
lit `Date.now()` lui-même ne se teste qu'en attendant réellement, et un test qui
attend finit désactivé.

Un refus ne consomme pas de jeton : compter les appels refusés allongerait
indéfiniment la pénalité d'un client qui réessaie, transformant une limite en
bannissement.

La limite s'applique **après** l'authentification et porte sur l'identité, pas
sur l'adresse IP : limiter une IP punirait tous les utilisateurs derrière un
même NAT sans empêcher un client authentifié de boucler.

### L'ordre des refus a été corrigé

`/api/live-token` vérifiait son secret partagé **avant** d'authentifier, et
répondait donc 503 « canal non configuré » à un appelant anonyme — qui
apprenait ainsi l'état de configuration du serveur sans rien prouver. L'ordre
est désormais identité, débit, puis configuration.

### La sauvegarde précède la suppression, et n'inclut aucun cours

Proposer une suppression définitive sans moyen d'emporter ses données d'abord
serait une impasse. L'écran place donc le téléchargement avant, et un test le
vérifie par la position réelle des deux blocs.

Les cours ne sont pas exportés : ce sont des données de marché, différentes au
prochain chargement, et les inclure ferait croire que la sauvegarde fige une
valorisation. L'historique, lui, est exporté — chaque point est une mesure qui
a réellement eu lieu et qu'aucun recalcul ne retrouverait.

Les décimales sortent en **chaînes**. `JSON.parse` convertirait
`150.750000000000` en flottant, et la quantité relue ne serait plus la quantité
sauvegardée.

L'export est une **route**, pas une action serveur : une action renvoie un
résultat à React, pas un fichier assorti d'un `Content-Disposition`.

### La suppression se vérifie au lieu de se supposer

L'application supprime les portefeuilles et s'appuie sur la cascade déclarée
par le schéma. Elle **recompte** ensuite les lignes de chaque table portant des
données utilisateur, et refuse d'annoncer un succès s'il en reste. Une
suppression « réussie » qui laisse des positions derrière elle est le pire
résultat possible de cet écran, et aucun test d'interface ne le verrait.

Les instruments survivent : c'est un référentiel de marché partagé, pas la
propriété d'un utilisateur. Les effacer casserait le portefeuille de tout autre
utilisateur détenant le même titre.

Un mot à recopier arme le bouton. Une case à cocher se coche sans lire ;
recopier oblige à traverser la phrase qui l'annonce. Le serveur revérifie ce
mot — une garde purement visuelle se contourne en une requête.

### Le champ de confirmation est non contrôlé

Avec `value={...}`, une saisie qui n'est pas une frappe caractère par caractère
— un collage, un remplissage automatique — peut désynchroniser l'état React de
la valeur affichée : le champ montre le bon mot et le bouton reste inactif. Or
coller le mot depuis le libellé juste au-dessus est exactement ce qu'un
utilisateur fera.

### `'unsafe-eval'` en développement uniquement

`next dev` compile avec des source maps en `eval()`. La politique les
interdisait, et le navigateur refusait **tout le bundle client** : l'application
s'affichait — le rendu serveur suffit — mais aucun composant client n'était
hydraté. Les formulaires continuaient de fonctionner par soumission native, ce
qui masquait entièrement le problème, y compris dans les parcours E2E de la voie
démonstration qui tournent sur `next dev`.

La politique de production n'autorise jamais `eval`. Un test E2E vérifie les
deux sens, et un autre vérifie qu'un composant purement client s'hydrate
réellement — sans quoi la régression repasserait inaperçue.

### Les vulnérabilités transitives se corrigent par `overrides`

Cinq avis — `postcss`, `sharp` — arrivaient par `next`. `pnpm.overrides` force
les versions corrigées, et la CI échoue au niveau `moderate`. Pas `high` : les
avis modérés touchant une dépendance de build sont exactement ceux qu'on cesse
de regarder si on ne les fait pas échouer. Une exception assumée doit passer par
`overrides`, où elle est visible dans le diff.

## Conséquences

- le hors-ligne n'est vérifié qu'avec la voie sans données : le service worker
  n'est pas enregistré par `next dev`, et le mode démonstration est refusé en
  production. Le mécanisme testé est le même, la page testée n'est pas peuplée ;
- la restauration d'une sauvegarde n'existe pas — l'export permet de repartir
  manuellement, pas de recharger un état ;
- la limitation de débit ne survit pas à un redémarrage et ne couvre pas
  plusieurs instances ;
- `'unsafe-inline'` reste nécessaire sur `script-src` en production : une
  politique par nonce demande un middleware dédié. Dette consignée.
