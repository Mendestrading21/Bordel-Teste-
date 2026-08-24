# Design System PortfolioLab V2

## Couleurs — rôles sémantiques

Ne pas coder les couleurs directement dans les composants.

Tokens recommandés à calibrer visuellement et vérifier AA :

```text
canvas             #050B14 à #07101D
surface-1          #0D1522 à #111927
surface-2          #151E2C à #1A2331
surface-3          surface légèrement plus claire
border-subtle      blanc 6–10 %
text-primary       blanc cassé
text-secondary     gris bleuté clair
text-tertiary      gris bleuté moyen
accent             lime/chartreuse
accent-foreground  presque noir
positive           lime/vert distinct de l’accent si nécessaire
negative           rose/framboise
info               cyan/bleu électrique
warning            ambre
```

Les plages sont des directions, pas des valeurs à recopier sans test.

## Typographie

Utiliser une sans-serif moderne déjà disponible ou une police système performante. Ne pas ajouter une police distante uniquement pour l’esthétique.

Échelle :

- display balance : 36–44 px mobile, poids 600–700 ;
- h1 : 26–30 ;
- h2 : 20–22 ;
- h3 : 16–18 ;
- body : 14–16 ;
- meta : 12–13 ;
- micro : 11–12, uniquement si contraste élevé.

Montants : `font-variant-numeric: tabular-nums`.

## Rayons

- hero : 24–28 px ;
- card : 18–22 px ;
- control : 14–18 px ;
- chip : pill ;
- icon button : cercle/pill.

Cohérence avant variété.

## Espacement

Base 4 px. Échelle recommandée : 4, 8, 12, 16, 20, 24, 32, 40.

Mobile : padding écran