# ADR 0005 — Passerelle temps réel et canal authentifié

- **Statut** : accepté
- **Date** : 2026-08-23
- **Lot** : 05

## Contexte

`ARCHITECTURE.md` impose une passerelle persistante pour tenir les connexions
WebSocket fournisseurs sans exposer les clés au navigateur.
`MARKET_DATA.md` fixe les règles d'abonnement : déduplication, période de grâce,
limitation de débit, dernier tick conservé, messages hors ordre ignorés,
reconnexion idempotente.

Le blocage du Lot 04 reste entier : aucun fournisseur réel n'est joignable. Toute
la mécanique est donc construite et vérifiée contre le fournisseur simulé.

## Décisions

### Le cœur de la passerelle ne connaît pas le transport

`GatewayCore` reçoit des identifiants de clients et rend des messages à
diffuser. Il n'importe ni WebSocket ni HTTP.

C'est ce qui permet de tester intégralement la déduplication, la reconnexion, la
limitation de débit et la péremption **sans ouvrir une seule socket**, donc de
façon déterministe. Le transport a sa propre suite, sur de vraies sockets, pour
ce qui ne peut être vérifié autrement : négociation du sous-protocole, refus
avant upgrade, acheminement réel d'un tick.

### Jeton HMAC plutôt que JWT

Le navigateur ne reçoit jamais de clé fournisseur ni le secret partagé. Il
demande à **son propre backend** un jeton de cinq minutes, que la passerelle
vérifie sans joindre ce backend.

Le jeton est un HMAC-SHA256 sur `userId.expiresAt`. Une bibliothèque JWT
complète apporterait ici plus de surface d'attaque que de valeur : il n'y a
qu'un émetteur, qu'une forme de jeton, et aucun besoin de négociation
d'algorithme — précisément le vecteur des attaques `alg: none`.

Deux détails ne sont pas cosmétiques :

- la signature est comparée en **temps constant** ; une comparaison naïve fuit
  la position du premier octet divergent ;
- la signature est vérifiée **avant** l'expiration. Répondre « expiré » à un
  jeton mal signé confirmerait à un attaquant que sa signature était bonne, et
  lui suffirait pour forger un jeton en ne corrigeant que la date.

Le motif du refus n'est jamais renvoyé au client, pour la même raison.

### Jeton dans le sous-protocole, pas dans l'URL

Une URL atterrit dans les journaux d'accès du serveur et de tout proxy
intermédiaire. Le sous-protocole WebSocket, non.

### Abonnements déclaratifs

Le client envoie la liste **complète** de ce qu'il veut, jamais un différentiel.
L'appel est donc idempotent, et un client qui se reconnecte après une coupure
retrouve exactement le bon état sans rejouer une séquence d'ajouts et de
retraits — séquence qu'une coupure aurait justement tronquée.

### Déduplication par comptage de références

Une seule souscription amont par symbole, quel que soit le nombre de clients.
Ouvrir une souscription par demandeur épuiserait le quota d'abonnements bien
avant d'être utile.

La fermeture attend une **période de grâce** de 30 secondes : sans elle, une
simple navigation entre deux écrans fermerait puis rouvrirait les mêmes
souscriptions, cycle coûteux chez la plupart des fournisseurs.

### Le cache rejette les messages hors ordre

Un WebSocket ne garantit pas l'ordre après une reconnexion. Un tick ancien
écrasant un tick récent ferait « reculer » un cours à l'écran. Le cache compare
les horodatages et refuse ce qui est plus ancien, ainsi que ce qui est
strictement identique — réveiller tous les clients pour une valeur inchangée est
du bruit pur.

### Seuils de péremption par nature de donnée

Une NAV publiée quotidiennement n'est pas périmée après une heure ; un cours
annoncé en direct l'est après une minute. Les seuils diffèrent donc par niveau
de fraîcheur, et `MANUAL` ne se périme jamais — une saisie manuelle ne devient
pas fausse en vieillissant.

Le cache peut **dégrader** une fraîcheur vers `STALE`, jamais l'améliorer.

### Regroupement des diffusions

Les ticks sont accumulés et diffusés toutes les 250 ms. Sans ce regroupement, un
instrument très actif enverrait des dizaines de messages par seconde à un
téléphone, pour un affichage arrondi au centime qui ne change pas visiblement.

Chaque client ne reçoit que **ses** symboles : diffuser tous les ticks à tous
ferait fuiter la composition des portefeuilles des autres utilisateurs.

### Backoff avec gigue et disjoncteur

La gigue n'est pas cosmétique : sans elle, tous les clients déconnectés par une
même panne fournisseur reviennent au même instant et reproduisent la surcharge
qui les a déconnectés.

Le disjoncteur suspend les tentatives après cinq échecs : marteler un
fournisseur en panne aggrave la panne et consomme le quota.

### Une panne est annoncée, jamais masquée

Une application dont le flux est coupé et qui continue d'afficher les derniers
cours sans le dire ment par omission. Le canal émet un message explicite, et
l'indicateur d'état reste visible en permanence.

### Le protocole est dupliqué côté client, et vérifié

Le client redéfinit le protocole plutôt que d'importer celui de la passerelle :
le navigateur ne doit charger ni `ws` ni `node:crypto`. Le prix de ce choix est
un risque de dérive, rendu visible par un test qui compare les deux définitions.

Le client **valide ce que le serveur envoie**. Une évolution de la passerelle ne
doit pas pouvoir injecter silencieusement une forme inattendue dans le calcul de
valorisation affiché. Un message partiellement corrompu conserve ses lignes
valides plutôt que d'être rejeté en bloc.

### Sans secret partagé, le canal refuse tout

Un canal sans secret accepterait n'importe quel jeton. Le refus est la seule
position sûre, et `/health` l'annonce (`liveChannel: "disabled"`) pour que l'état
soit visible sans lire les journaux.

## Un défaut trouvé en conditions réelles

La passerelle instanciait le fournisseur simulé avec une liste d'instruments
**vide**. Elle démarrait, annonçait `liveChannel: ready`, acceptait les
connexions — et ne résolvait jamais aucun symbole.

Aucun test unitaire ne pouvait le voir : ils fournissaient tous leurs propres
instruments. Le défaut n'est apparu qu'en interrogeant le processus réel avec un
vrai client WebSocket. `DEMO_INSTRUMENTS` est désormais exporté depuis le package
`market-data` et un test vérifie qu'il couvre exactement les instruments du seed.

## Conséquences

- La passerelle est utilisable de bout en bout dès maintenant, avec des données
  explicitement fictives.
- Brancher un fournisseur réel ne demandera que d'implémenter `subscribe` dans
  un adaptateur : les deux chemins passent déjà par `onProviderQuote`, et le
  reste de la passerelle ne distingue pas les deux cas.
- `MARKET_GATEWAY_SHARED_SECRET` devient nécessaire pour activer le temps réel.

## Alternatives écartées

- **Jeton en paramètre d'URL** : atterrirait dans les journaux d'accès.
- **Diffuser chaque tick immédiatement** : saturerait un téléphone pour un
  affichage qui ne change pas visiblement.
- **Fermer les souscriptions dès le dernier départ** : provoquerait un cycle
  fermeture/réouverture à chaque navigation.
- **Faire porter la clé fournisseur au navigateur** : contredit l'invariant
  central du produit.
