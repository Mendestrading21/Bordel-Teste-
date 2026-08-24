# Architecture de l’information V2

## Accueil

Ordre recommandé :

1. header compact + avatar/monogramme optionnel + statut données ;
2. hero `💼 Patrimoine` ;
3. variation Aujourd’hui ;
4. sélecteur de période compact si historique disponible ;
5. mini graphique ;
6. trois quick actions ;
7. `Mes positions` avec 3–5 lignes ;
8. `Répartition` synthétique ;
9. anomalies uniquement si elles existent.

Les alertes ne doivent pas occuper d’espace quand tout va bien.

## Positions

Header + recherche immédiatement accessible.

Chips horizontales : `Toutes`, `📈 Actions`, `🧺 ETF`, `🎯 Options`, `🏦 Fonds`, `💵 Cash`.

Chaque ligne :

- symbole/avatar instrument ;
- nom ;
- compte secondaire ;
- valeur CHF ;
- variation ou P&L ;
- badge fraîcheur seulement si utile.

Les détails source, FX, multiplicateur et moteur restent sur la fiche.

## Détail

1. identité instrument ;
2. prix + variation ;
3. valeur de la position + P&L ;
4. graphique ;
5. métriques spécifiques ;
6. compte/quantité/coût ;
7. `Détails de valorisation` repliable ;
8. modifier/supprimer en bas.

## Ajouter

Premier écran très simple :

`Qu’ajoutez-vous ?`

Cartes compactes :

- 📈 Action
- 🧺 ETF
- 🏦 Fonds
- 🎯 Option
- 💵 Cash
- ✏️ Autre

Puis progressive disclosure. Ne montrer que les champs nécessaires à l’étape courante.

Le CTA principal est fixe ou facilement accessible en bas, sans masquer le clavier iOS.

## Analyse

Pas un mur de graphiques.

1. sélecteur période ;
2. évolution patrimoine ;
3. allocation ;
4. performance par position ;
5. comptes/devise ;
6. options/exposition en section avancée.

Une carte = une question.

## Réglages

Sections simples :

- 👤 Profil / accès
- 🏷️ Comptes
- 🔄 Données de marché
- 💱 Devise
- 📦 Sauvegarde
- 🛡️ Confidentialité
- ℹ️ À propos

Les actions destructrices sont isolées dans une zone `Danger` en bas.
