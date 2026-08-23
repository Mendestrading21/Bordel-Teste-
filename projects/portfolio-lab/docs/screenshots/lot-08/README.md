# Captures — Lot 08

Écran d'analyse : évolution du patrimoine, allocations, contribution au P&L,
exposition des options et réconciliation.

| Fichier                                            | Taille      | Écran                                               |
| -------------------------------------------------- | ----------- | --------------------------------------------------- |
| `mobile-390x844-analyse.png`                       | 390 × 1400  | Haut de l'écran : courbe, variation, allocations    |
| `mobile-390x844-historique-deplie.png`             | 390 × 1400  | Tableau des valeurs chiffrées déplié                |
| `mobile-390x844-contribution-options.png`          | 390 × 1200  | Contribution au P&L et exposition des options       |
| `mobile-390x844-reconciliation.png`                | 390 × 700   | Réconciliation et empreinte des composants          |
| `mobile-390x844-accueil.png`                       | 390 × 844   | Accueil : total, P&L, performance en décimal exact  |
| `desktop-1280x900-analyse.png`                     | 1280 × 1500 | Même écran en large : courbe et allocations         |
| `desktop-1280x900-contribution-reconciliation.png` | 1280 × 1200 | Contribution, exposition des options et bas de page |

La courbe est doublée d'un résumé textuel — dates de début et de fin, montants
et bornes — porté par l'attribut `aria-label` : l'information chiffrée
essentielle est annoncée sans qu'aucune interaction soit nécessaire. Les valeurs
exactes sont à un clic, dans un tableau.

L'axe horizontal est proportionnel aux dates, et chaque mesure porte un repère :
le trait entre deux points est une interpolation, pas une donnée.

Les cinq points visibles proviennent des six snapshots du seed — le 6 mai en
porte deux, réduits à un seul dans l'historique quotidien.

Toutes les données sont fictives : instruments « Démo », cours de fixture,
historique inventé.
