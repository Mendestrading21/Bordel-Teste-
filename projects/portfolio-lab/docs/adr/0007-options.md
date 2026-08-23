# ADR 0007 — Options : identité du contrat et choix du mark

- **Statut** : accepté
- **Date** : 2026-08-23
- **Lot** : 07

## Contexte

Deux exigences se croisent. `MARKET_DATA.md` fixe la cascade de valorisation :
midpoint si la fourchette est présente, fraîche et cohérente ; sinon dernier
trade frais ; en dernier recours le dernier mark connu, marqué `STALE`, la
méthode étant toujours affichée. `UX_UI.md` impose un parcours guidé en cinq
étapes plutôt qu'une saisie libre de symbole.

## Décisions

### Le symbole OSI est implémenté ici, pas délégué

C'est **la** clé d'identité d'un contrat. Deux contrats qui ne diffèrent que par
le strike ont des valeurs sans rapport, et le format encode le strike en
millièmes sur huit chiffres.

Passer par un flottant pour cette conversion produirait `199999` au lieu de
`200000` sur certaines valeurs, et le symbole résultant désignerait un contrat
qui n'existe pas. La conversion se fait donc en arithmétique décimale exacte, et
un strike plus fin que le millième est **refusé** plutôt qu'arrondi.

`parseOsiSymbol` vérifie que la date existe réellement : `270230` a la bonne
forme, mais le 30 février n'existe pas. Il renvoie `null` plutôt que de lever —
un symbole illisible reçu d'un fournisseur est une donnée à écarter, pas une
erreur de programmation.

`isSameContract` compare les strikes en décimal : « 200 » et « 200.000 »
désignent le même contrat, qu'une comparaison de chaînes distinguerait.

### Parcours guidé, jamais de saisie libre

Un symbole OSI mal tapé ne produit pas une erreur : il désigne un **autre
contrat existant**. La position serait alors durablement fausse, sans rien pour
le signaler.

Le parcours impose donc sous-jacent → sens → échéance → strike → vérification.
Si la combinaison ne correspond à aucun contrat, **aucun approchant n'est
proposé** : ce serait un autre contrat, pas celui voulu.

Les strikes sont triés numériquement et non lexicographiquement — un tri de
chaînes placerait « 100 » avant « 90 ».

### Le choix du mark est auditable

`markOption` renvoie la méthode retenue **et la liste des motifs** ayant écarté
les méthodes précédentes. Une option valorisée par son dernier échange sans
explication laisserait croire à une fourchette absente, alors qu'elle peut être
simplement aberrante.

Quatre situations écartent le midpoint :

- **fourchette absente** — rien à calculer ;
- **fourchette inversée** — bid supérieur à ask signale une donnée corrompue ;
- **bid ou ask à zéro** — courant sur une option très hors de la monnaie ; le
  midpoint qui en résulterait n'aurait aucun sens ;
- **fourchette trop large** — au-delà de 50 % du milieu, elle ne dit plus grand
  chose du prix. Un bid à 0.05 et un ask à 1.90 donnent 0.975, qu'aucune
  transaction ne validerait ;
- **cotation trop ancienne** — une option peu liquide affiche parfois un bid/ask
  vieux de plusieurs heures ; en tirer un midpoint donnerait une précision
  illusoire.

En dernier recours, le dernier prix connu est conservé mais **la fraîcheur est
dégradée en `STALE` quoi qu'annonce le fournisseur** : une option peu liquide
garde un dernier trade qui peut dater de plusieurs jours.

Quand rien n'est exploitable, l'échec est explicite. Un prix de repli inventé
serait pire qu'une position non valorisée — le moteur du Lot 03 sait déjà
exposer la lacune sans fausser les totaux.

### Les motifs sont traduits avant affichage

`SPREAD_TOO_WIDE` n'apprend rien à un utilisateur. Chaque motif a son libellé
français, et un test E2E vérifie que l'identifiant interne n'atteint jamais
l'écran.

### Le multiplicateur non standard est signalé, pas bloqué

C'est l'erreur la plus coûteuse du domaine : elle fausse la valeur d'un facteur
entier sans rien casser. Un contrat ajusté après un split, ou une option sur
indice, ont légitimement un multiplicateur différent de 100 — l'avertissement
mentionne donc explicitement le cas du split, pour que l'utilisateur puisse
juger plutôt que douter.

### Aucune sensibilité n'est calculée

`ROADMAP.md` : « Greeks seulement si sourcés ».

Calculer un delta ou une volatilité implicite exige un modèle, un taux sans
risque, une hypothèse de dividende et une convention de temps. Chacun de ces
choix déplace le résultat, et deux implémentations raisonnables divergent
sensiblement. Afficher un chiffre issu de nos propres hypothèses à côté de cours
réels laisserait croire à une donnée de marché.

`parseGreeks` exige donc `provider` **et** `asOf` : sans source ni horodatage,
une sensibilité n'est pas attribuable. Un objet dont aucune valeur n'est
exploitable renvoie `null` plutôt qu'une section vide et trompeuse.

L'écran dit explicitement qu'aucune sensibilité n'est calculée, plutôt que
d'afficher des tirets que l'utilisateur pourrait lire comme des zéros.

### Les jours restants sont calendaires

Une option expire à une date fixe, week-end ou non — contrairement à la fraîcheur
d'une NAV, qui se compte en jours ouvrés. Un contrat reste négociable **le jour**
de son échéance : `isExpired` ne le déclare échu que le lendemain.

### La chaîne de démonstration couvre les cas de repli

Une chaîne où tout serait liquide ne prouverait rien de la cascade. Elle contient
donc un contrat liquide, un illiquide à fourchette aberrante, un sans aucune
cotation, un au multiplicateur ajusté à 112, et un déjà expiré.

## Conséquences

- L'enregistrement d'une position d'option depuis l'écran guidé attend le premier
  fournisseur réel ; la saisie manuelle reste disponible entre-temps, et l'écran
  le dit.
- Ajouter un fournisseur d'options demandera de fournir une `OptionChain` ; tout
  le reste — navigation, vérification, avertissements, choix du mark — est déjà
  en place et testé.

## Alternatives écartées

- **Saisie libre d'un symbole OSI** : un symbole mal tapé désigne un autre
  contrat existant. Envisageable plus tard comme raccourci expert, avec
  vérification et confirmation.
- **Proposer le contrat le plus proche** quand la combinaison ne correspond à
  rien : c'est un autre contrat.
- **Calculer les Greeks** : produirait des chiffres présentés comme des données
  de marché alors qu'ils dépendraient de nos hypothèses.
- **Supposer un multiplicateur de 100** : explicitement interdit par la
  spécification, et faux dès qu'un contrat a été ajusté.
