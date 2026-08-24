# Design V2 — Plan d'exécution DS-01 → DS-09

Un lot = une branche = une PR. Aucune réécriture globale en un commit.

## Palette proposée

Calibrée depuis les plages du `DESIGN_SYSTEM.md`, puis vérifiée AA par test automatisé.

```text
canvas            #060D18   bleu-nuit profond (remplace #0b0e11 neutre)
surface-1         #0E1725
surface-2         #16202F
surface-3         #1D2839   nouveau — troisième niveau réclamé par le système
border-subtle     rgba(255,255,255,0.07)
border-strong     rgba(255,255,255,0.13)
text-primary      #EEF2F7
text-secondary    #9FB0C4   gris bleuté clair
text-tertiary     #6E8098   nouveau — méta et micro-labels
accent            #C6F04A   chartreuse adoucie
accent-foreground #0A1005   presque noir, pour texte sur accent
positive          #63D89A   distinct de l'accent, comme le système l'autorise
negative          #F2607E   framboise
info              #4CC9F0   cyan — graphique secondaire uniquement
warning           #F0B450   ambre
stale             #7E8CA0
```

L'accent lime sert **uniquement** au CTA principal, à l'onglet actif, au focus et au point clé d'un graphique. Le positif reste vert pour ne pas confondre « action » et « gain ».

## Lots

| Lot       | Périmètre            | Livrable visuel                                                                                                                         |
| --------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **DS-01** | Tokens et primitives | palette 3 surfaces, échelle typo, rayons, espacement ; primitives `Card`, `Stat`, `Chip`, `Section`, `Button` ; test de contraste AA    |
| **DS-02** | Shell et navigation  | header compact (supprime les 150 px), bandeau démo réduit à une pastille, `Ajouter` accentué au centre                                  |
| **DS-03** | Accueil              | hero `💼 Patrimoine`, variation du jour chiffrée, mini-courbe, 3 raccourcis, aperçu positions, anomalies **seulement si présentes**     |
| **DS-04** | Positions + détail   | recherche, chips de type, liste dense en une carte ; fiche : identité → prix → valeur → graphique → `Détails de valorisation` repliable |
| **DS-05** | Ajouter              | écran « Qu'ajoutez-vous ? » à 6 cartes, puis divulgation progressive ; CTA accessible sans masquer le clavier iOS                       |
| **DS-06** | Analyse              | sélecteur de période, une carte = une question, exposition options en section avancée                                                   |
| **DS-07** | Fonds et options     | alignement sur les nouvelles primitives, NAV et méthode de mark toujours lisibles                                                       |
| **DS-08** | Réglages et états    | sections 👤 🏷️ 🔄 💱 📦 🛡️ ℹ️, zone `Danger` isolée ; états vide/erreur/loading/offline/stale/unavailable                               |
| **DS-09** | Polish               | motion 150–250 ms, `prefers-reduced-motion`, clavier, contraste final, PWA iPhone                                                       |

## Contrôles imposés à chaque lot

1. captures BEFORE (déjà prises pour l'ensemble) ;
2. tests existants verts **avant** modification ;
3. modification ;
4. captures AFTER aux trois tailles ;
5. comparaison visuelle ;
6. 390×844, 430×932, desktop ;
7. clavier et `prefers-reduced-motion` ;
8. `lint`, `typecheck`, `test:unit`, `test:integration`, `test:e2e`, `build` ;
9. STATUS.md et issue #16 ;
10. commit atomique, PR, fusion seulement si vert.

## Garde-fous

Aucune modification de : moteur décimal, valorisation, NAV, mark options, RLS, migrations, protocole live, fraîcheur, modèle de position, sécurité, séparation mock/réel.

Les tests E2E existants (469 assertions) servent de filet : toute régression fonctionnelle les fait échouer. Ceux qui vérifient un **libellé** précis seront ajustés uniquement quand le libellé change volontairement, jamais pour masquer une régression.

## Écart signalé

Le skill impose de lire `references/SCREEN_SPECS.md` et `references/QUALITY_VISUAL.md`. **Ces deux fichiers n'existent pas** sur `main` — seuls `DESIGN_BRIEF.md`, `INFORMATION_ARCHITECTURE.md` et `DESIGN_SYSTEM.md` sont présents. `DESIGN_SYSTEM.md` s'interrompt par ailleurs en milieu de phrase (« Mobile : padding écran »).

Conséquence : les spécifications d'écran et les critères visuels sont dérivés du `DESIGN_BRIEF` et de l'`INFORMATION_ARCHITECTURE`, et l'échelle d'espacement est complétée par la base 4 px documentée. Les choix comblés sont marqués dans les ADR de chaque lot plutôt que présentés comme venant du skill.
