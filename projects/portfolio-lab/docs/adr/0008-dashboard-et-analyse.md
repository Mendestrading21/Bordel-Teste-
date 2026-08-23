# ADR 0008 — Dashboard et analyse : historique mesuré, agrégats réconciliés

- **Statut** : accepté
- **Date** : 2026-08-23
- **Lot** : 08

## Contexte

`ROADMAP.md` demande pour ce lot le total en CHF, le P&L latent et journalier,
les allocations, l'historique quotidien, la contribution au P&L et l'exposition
des options par sous-jacent. Le critère d'acceptation est net : « tous les
agrégats se réconcilient avec les positions et les taux stockés ».

`DATA_MODEL.md` prévoit un snapshot quotidien après publication des données
attendues, un snapshot supplémentaire à chaque modification manuelle importante,
la conservation de la version du moteur, et un recalcul reproductible à partir
des composants.

## Décisions

### L'historique est mesuré, jamais reconstitué

Un historique se construit **uniquement** à partir de valorisations réellement
effectuées à leur date. Rejouer les positions d'aujourd'hui contre des cours
passés produirait une courbe convaincante et fausse : les positions ont changé,
les taux aussi, et rien à l'écran ne distinguerait la reconstitution de la
mesure.

Conséquence assumée : un portefeuille neuf n'a pas de courbe, et l'écran le dit
plutôt que d'en inventer une.

### L'historique quotidien est dérivé, pas stocké

`portfolio_snapshots` est horodaté à l'instant, et `DATA_MODEL.md` prévoit
explicitement plusieurs points par jour. Contraindre la table à un point par
jour ferait échouer un enregistrement légitime.

`dailyHistory` réduit donc la série à une journée civile en retenant le
**dernier** point de chaque jour : il intègre les modifications faites dans la
journée, là où le premier décrirait un portefeuille que l'utilisateur a depuis
changé.

La frontière des journées est `Europe/Zurich`, pas UTC. Le patrimoine est
consolidé en CHF pour un utilisateur suisse ; découper en UTC rattacherait un
snapshot pris à 00 h 30 à Zurich au jour précédent, et l'historique montrerait
deux points le même jour puis un trou le lendemain.

### Une série mêlant deux versions du moteur n'est pas tracée

Une évolution de formule déplace le résultat sans que le patrimoine ait bougé.
Superposer des points issus de versions différentes — ou de devises de
consolidation différentes — dessinerait une marche qui ne correspond à aucun
mouvement réel.

`isComparableSeries` vérifie **toute** la série, pas seulement ses bornes : une
courbe dont un point du milieu vient d'une autre version n'est pas une mesure
continue. Quand elle échoue, l'écran explique pourquoi au lieu d'afficher une
courbe amputée.

Le seed de démonstration porte la version courante du moteur, et un test
d'intégration l'exige : une montée de version fait ainsi échouer la suite plutôt
que d'effacer silencieusement la courbe de démonstration.

### L'axe horizontal est proportionnel aux dates

Espacer les points régulièrement ferait ressembler un trou de trois mois à un
intervalle d'un jour, et donnerait à voir une progression régulière là où
l'historique est lacunaire.

Chaque mesure porte en plus un repère visible tant que la série reste courte :
le segment entre deux points est une interpolation, pas une donnée. Au-delà
d'une trentaine de points les repères se chevauchent et disparaissent, la
densité de la série jouant alors le même rôle.

### L'empreinte des composants rend un snapshot vérifiable

`components_hash` répond à une question précise : _les composants ayant produit
ce snapshot sont-ils encore ceux d'aujourd'hui ?_ L'empreinte couvre les valeurs
natives, les taux appliqués, les horodatages, les fournisseurs, les types de
prix, les fraîcheurs — et **les positions non valorisées**, car passer de « prix
indisponible » à « prix disponible » change le total sans qu'aucune ligne
valorisée n'ait bougé.

Le calcul est FNV-1a sur deux passes, soit 64 bits. Ce n'est pas une empreinte
cryptographique et ne prétend pas l'être : elle sert à détecter un changement,
pas à résister à un adversaire cherchant une collision. Ce choix évite une
dépendance, fonctionne côté serveur comme dans le navigateur, et reste
strictement déterministe entre exécutions — ce que `crypto.subtle` ne permet pas
de façon synchrone.

Les positions sont triées par identifiant avant sérialisation : l'ordre de
lecture en base peut varier selon le `order by`, et une empreinte sensible à cet
ordre signalerait en permanence de faux écarts.

### La réconciliation est affichée, pas seulement testée

Le critère d'acceptation du lot est une identité comptable. La vérifier en test
seulement laisserait l'utilisateur sans moyen de constater qu'elle tient : elle
est donc recalculée à chaque rendu et affichée.

La comparaison est en **égalité décimale stricte**. Les montants sont exacts de
bout en bout ; tolérer un écart d'un centime masquerait un défaut réel du moteur
derrière une marge d'arrondi imaginaire.

### Le snapshot s'enregistre sur demande explicite

Écrire un point à chaque affichage de la page transformerait une lecture en
écriture et remplirait l'historique de points identiques. L'action est donc
déclenchée par l'utilisateur.

Un portefeuille dont aucune position n'est valorisable ne produit **pas** de
point : enregistrer un patrimoine de zéro creuserait la courbe là où il n'y a
qu'une absence de cours.

Le snapshot quotidien automatique prévu par `DATA_MODEL.md` dépend d'un
ordonnanceur ; il reste à faire tant qu'aucun fournisseur réel n'alimente les
cours.

### L'exposition des options distingue valeur et notionnel

Deux calls valant mille francs peuvent engager plusieurs dizaines de milliers de
francs si les contrats sont exercés. Les deux chiffres sont donc rendus côte à
côte, jamais l'un à la place de l'autre.

Le notionnel utilise le multiplicateur **réellement enregistré** pour chaque
contrat. Un contrat non valorisé est exclu de l'exposition plutôt que compté à
zéro : sa valeur de marché est inconnue, et lui en prêter une sous-estimerait
l'exposition affichée.

### Le pourcentage de rendement passe par le moteur

L'accueil calculait son pourcentage de P&L en `Number`, réintroduisant l'erreur
de flottant sur le chiffre le plus regardé de l'écran. `portfolioReturn` le
calcule en décimal, rapporté à la **valeur absolue** du capital investi — sans
quoi un portefeuille à coût net négatif verrait le signe de son rendement
inversé.

Un capital investi nul donne `null`, pas `0 %` : « aucun rendement mesurable »
et « rendement de zéro » sont deux informations différentes.

## Conséquences

- un portefeuille neuf n'a pas de courbe, et c'est le comportement voulu ;
- l'historique dépend d'une action de l'utilisateur tant qu'aucun ordonnanceur
  n'existe ;
- une montée de `CALCULATION_VERSION` coupe volontairement la comparabilité de
  l'historique existant ; la reprise de ces points est une décision produit, pas
  une correction technique.
