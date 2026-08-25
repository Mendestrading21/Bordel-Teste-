# Les pannes silencieuses, et comment on les a fermées

Six défauts de la même famille ont été trouvés dans ce dépôt. Aucun ne
provoquait d'erreur, aucun n'apparaissait à la compilation, aucun n'était
visible à l'exécution. La configuration paraissait correcte, l'écran restait
muet, et rien nulle part ne reliait les deux.

Ce document existe pour qu'un septième ne passe pas.

## Les six

| # | Défaut | Conséquence |
| --- | --- | --- |
| 1 | `finnhub` avait un adaptateur que la fabrique n'instanciait pas | `FINNHUB_API_KEY` renseignée, aucun cours, aucun message |
| 2 | `alphavantage` et `factset` étaient configurables sans adaptateur | activés avec une clé, ils passaient toutes les validations et n'instanciaient rien |
| 3 | Le besoin `fx` était routable sans méthode `fxRate()` | toute valorisation multidevise retombait sur des taux de fixture |
| 4 | Le besoin `optionChain` l'était aussi, sans méthode ni sur le routeur ni sur le contrat | une capacité invérifiable de bout en bout |
| 5 | Massive annonçait `optionChains: true` sans rien pouvoir servir | le routeur l'aurait choisi, puis chaque appel aurait échoué |
| 6 | `finra`, `alphavantage` et `factset` n'apparaissaient pas sur l'écran Réglages | configurables mais invisibles : impossible de comprendre pourquoi rien n'arrive |

Le point commun n'est pas une négligence ponctuelle. C'est une **asymétrie
structurelle** : déclarer une capacité coûte une ligne, l'implémenter coûte un
module, et rien dans le langage ne relie les deux. Un drapeau `boolean` dans un
objet de capacités est une promesse que le compilateur ne vérifie pas.

## Ce qui les rend impossibles maintenant

`packages/market-data/src/reachability.test.ts` vérifie trois invariants.

### 1. Chaque besoin du routeur a un point d'entrée

`ProviderRequirement` était une union TypeScript, donc absente à l'exécution :
rien ne pouvait la parcourir. Elle est désormais dérivée d'un tableau
`PROVIDER_REQUIREMENTS` déclaré comme **valeur**, et le test exige une méthode
de routeur pour chacun de ses membres.

Un second test impose que la table des points d'entrée couvre exactement la
liste — sans quoi ajouter un besoin sans l'y inscrire déplacerait le trou au
lieu de le fermer.

### 2. Capacité annoncée ⟺ méthode présente

Pour chaque couple `{ capacité, méthode }` — `fx`/`getFxRate`,
`streaming`/`subscribe`, `optionChains`/`getOptionChain` — la vérification est
faite **dans les deux sens** :

- annoncer sans implémenter fait choisir le fournisseur puis échouer à chaque
  appel : une lacune de couverture déguisée en panne intermittente ;
- implémenter sans annoncer fait écarter le fournisseur par le routeur, et la
  fonction reste inatteignable — exactement le cas 3.

### 3. Configurable ⟹ instanciable, ou signalé

Pour chaque fournisseur que `readLiveProviderConfig` accepte, activé avec une
clé : soit la fabrique l'instancie, soit la validation le signale. **Jamais ni
l'un ni l'autre** — c'est précisément ce qu'a été Finnhub.

Un dernier test impose que tout fournisseur configurable figure dans
`candidates.ts`, qui alimente l'écran Réglages : un fournisseur absent de cette
liste serait invisible pour l'utilisateur.

## Vérification du garde-fou lui-même

Un test qui ne peut pas échouer ne protège rien. Les quatre défauts
réintroduits un par un sont tous rattrapés :

| Mutation | Résultat |
| --- | --- |
| retirer `fxRate()` du routeur | 1 test échoue |
| retirer `optionChain()` du routeur | 1 test échoue |
| rendre à Massive son `optionChains: true` | 1 test échoue |
| retirer Finnhub de la fabrique | 2 tests échouent |

## Ce que ce garde-fou ne couvre pas

Il vérifie que le **chemin existe**, jamais que la donnée est correcte. Un
adaptateur peut satisfaire ces trois invariants et renvoyer des cours faux.
C'est le rôle de `contract-suite.ts` et des fixtures de chaque adaptateur.

Il ne prouve pas non plus qu'un fournisseur répond : aucun appel réel n'a pu
être fait depuis l'environnement de développement, dont l'egress ne sort que
vers GitHub.
