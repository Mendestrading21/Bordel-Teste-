# ADR 0010 — Périmètre et limites de la release candidate 1.0

- **Statut** : accepté
- **Date** : 2026-08-23
- **Lot** : 10

## Contexte

`ROADMAP.md` demande pour ce lot un audit fonctionnel complet, la correction des
écarts critiques, la séparation des données de démonstration, la documentation
d'installation et d'exploitation, une matrice de compatibilité, un rapport de
release, et un tag **proposé mais non créé sans validation**.

Le critère d'acceptation exige que « tous les parcours critiques passent ». Ils
ne passent pas tous. C'est ce que cet ADR consigne, plutôt que de redéfinir le
critère pour qu'il soit atteint.

## Décisions

### La modification d'une position ne touche ni l'instrument ni le compte

L'audit a trouvé le parcours critique n° 10 à moitié livré : la suppression
existait, la modification non. Elle est ajoutée — mais restreinte à la quantité,
au coût moyen, à sa devise et aux notes.

Changer l'instrument d'une position réécrirait son passé : les points
d'historique déjà enregistrés ont été calculés sur le titre d'origine, et rien à
l'écran ne distinguerait ensuite la ligne corrigée d'une ligne cohérente.
Corriger une erreur d'instrument passe donc par une suppression et une
ressaisie, ce qui laisse une trace lisible.

Le compte suit la même logique : il classe la position dans les allocations déjà
mesurées.

### L'audit énumère ce qui manque, sans arrondir

Un rapport de release qui ne listerait que ce qui fonctionne serait un argumentaire,
pas un audit. Chaque parcours et chaque écran porte donc un état vérifié, et
chaque état « partiel » ou « non livré » porte sa raison.

Deux conséquences assumées :

- la checklist RC affiche **8 parcours critiques sur 10**, et le verdict est
  « release candidate, pas release » ;
- la couverture marché réelle est documentée comme **nulle**, ce qui est le fait.

### Aucune recommandation de fournisseur n'est formulée

Elle ne pourrait reposer que sur les affirmations commerciales des vendeurs, que
`MARKET_DATA.md` interdit explicitement de prendre pour argent comptant — et
aucune n'a pu être vérifiée, la documentation elle-même étant inaccessible
depuis cet environnement.

Formuler malgré tout une recommandation serait la partie du rapport la plus
susceptible d'être suivie, et la moins fondée.

### L'authentification n'est pas écrite « en aveugle »

Brancher Supabase Auth demande un projet Supabase. Écrire le flux sans pouvoir
l'exécuter une seule fois produirait du code qui _paraît_ intégré, et un rapport
qui l'annoncerait comme livré.

Ce qui existe — machine d'états, détection de configuration, écrans qui refusent
d'afficher un patrimoine sans identité, RLS active et forcée — est réel et
testé. Ce qui manque est nommé.

### La matrice de compatibilité liste ce qui n'a jamais été exécuté

« Non testé » n'est pas « incompatible ». Une matrice qui ne montrerait que les
lignes vérifiées laisserait supposer que le reste l'est aussi.

Safari iOS y figure en premier : c'est la cible réelle du produit — seule voie
vers l'écran d'accueil d'un iPhone — et aucun test n'y a tourné. Les gabarits
« iPhone » de la suite sont des dimensions rendues par Chromium, pas par WebKit.

### Le tag est proposé, jamais créé

Avec un préfixe `portfolio-lab-` : le dépôt héberge plusieurs projets, et un tag
`v1.0.0` nu laisserait croire qu'il les concerne tous.

## Conséquences

- l'application ne doit pas être exposée sur un réseau public tant que
  l'authentification n'existe pas ;
- la garde qui refuse le mode démonstration en production est ce qui empêche
  aujourd'hui de contourner cette absence : elle ne doit pas être assouplie ;
- pour un usage local et personnel, le produit est utilisable de bout en bout ;
- la validation visuelle finale appartient à l'utilisateur, et reste ouverte.
