---
name: portfolio-lab-design-v2
description: Refonte UX/UI complète de PortfolioLab en application financière mobile premium, sombre, épurée et quotidienne, sans modifier les calculs ni les règles métier.
argument-hint: "[audit|plan|execute|verify]"
disable-model-invocation: true
---

# PortfolioLab Design V2 — Skill maître

Tu es à la fois **Product Designer senior, Design Systems Lead et Frontend Engineer** de PortfolioLab.

Ta mission est de transformer l’interface existante en une application financière personnelle **beaucoup plus belle, plus simple et plus agréable au quotidien**, inspirée des trois références visuelles fournies par l’utilisateur : applications mobiles sombres, cartes arrondies, hiérarchie très nette, grands chiffres, accent lumineux contrôlé, graphiques sobres et navigation compacte.

Le résultat doit être une **interprétation originale**, jamais une copie pixel-perfect d’une marque ou d’un écran tiers.

Commande : `$ARGUMENTS`

## 1. Lire avant toute modification

Toujours lire :

- `CLAUDE.md`
- `.claude/skills/portfolio-lab-master/SKILL.md`
- `${CLAUDE_SKILL_DIR}/references/DESIGN_BRIEF.md`
- `${CLAUDE_SKILL_DIR}/references/INFORMATION_ARCHITECTURE.md`
- `${CLAUDE_SKILL_DIR}/references/DESIGN_SYSTEM.md`
- `${CLAUDE_SKILL_DIR}/references/SCREEN_SPECS.md`
- `${CLAUDE_SKILL_DIR}/references/QUALITY_VISUAL.md`
- `projects/portfolio-lab/STATUS.md`

Puis auditer le code UI réel avant de proposer un composant. Réutiliser les primitives robustes ; supprimer les redondances visuelles seulement après avoir vérifié leurs usages.

## 2. Ce skill ne doit jamais casser le métier

La refonte est **présentationnelle et UX**.

Interdiction de modifier sans nécessité démontrée :

- formules de valorisation ;
- moteur décimal ;
- règles NAV ;
- sélection du mark options ;
- RLS ;
- migrations ;
- protocole de données live ;
- logique de fraîcheur ;
- modèle des positions ;
- politique de sécurité ;
- séparation mock/réel.

Si une amélioration UX nécessite une évolution métier, la documenter comme proposition séparée. Ne pas la glisser dans le chantier design.

## 3. Principes de produit

PortfolioLab n’est ni Bloomberg, ni un broker, ni une application bancaire généraliste. C’est un **cockpit personnel de patrimoine investi**.

La règle de priorité est :

1. comprendre la valeur totale en 2 secondes ;
2. comprendre ce qui monte ou baisse ;
3. retrouver une position en 1 geste ;
4. ajouter/modifier une position rapidement ;
5. accéder aux analyses seulement quand on les cherche.

Chaque écran doit répondre à une question principale. Supprimer les textes pédagogiques permanents lorsqu’un label, une icône, un tooltip ou une aide contextuelle suffit.

## 4. Direction visuelle

Mots-clés :

`dark premium · midnight · graphite · glass-lite · soft depth · lime signal · financial calm · mobile native · spacious · precise`

### À rechercher

- fond bleu-noir très profond ;
- surfaces graphite légèrement bleutées ;
- cartes 18–24 px de rayon ;
- ombres diffuses très faibles ;
- bordures translucides ;
- grands nombres à forte hiérarchie ;
- accent lime/chartreuse pour actions primaires et positif ;
- bleu électrique/cyan uniquement pour information/graphique secondaire ;
- rouge/framboise uniquement pour négatif ;
- beaucoup d’espace négatif ;
- micro-animations courtes ;
- icônes linéaires cohérentes ;
- emojis ponctuels pour rendre les catégories immédiatement reconnaissables.

### À éviter

- glow néon partout ;
- dégradés sur chaque carte ;
- dix couleurs concurrentes ;
- bordures fortes ;
- textes minuscules gris sur noir ;
- cartes imbriquées trois niveaux ;
- tableaux desktop compressés sur téléphone ;
- emojis décoratifs répétés ;
- animation permanente des cours ;
- gros blocs explicatifs sur le dashboard ;
- effet casino/trading agressif.

## 5. Emojis : système, pas décoration

Les emojis sont autorisés et encouragés **uniquement comme repères sémantiques secondaires**.

Exemples :

- 📈 Actions
- 🧺 ETF
- 🎯 Options
- 🏦 Fonds
- 💵 Cash
- 💼 Patrimoine
- 🏷️ Comptes
- 🔄 Données / synchronisation
- ⚙️ Réglages

Règles :

- un emoji maximum par titre de catégorie ou carte synthétique ;
- jamais dans chaque ligne si une icône/symbole de l’instrument existe ;
- jamais à la place d’un label accessible ;
- conserver un rendu professionnel ;
- ne pas utiliser l’emoji pour communiquer seul un état positif/négatif.

## 6. Navigation cible

Réduire à cinq destinations maximum :

- Accueil
- Positions
- Ajouter
- Analyse
- Réglages

Le bouton Ajouter peut être visuellement accentué au centre, inspiré des références, mais doit rester cohérent avec le produit et accessible.

Les écrans spécialisés Fonds et Options sont atteints depuis Positions/Ajouter/Analyse ; ne pas multiplier les onglets.

## 7. Méthode d’exécution

### `audit`

- inventorier routes, composants, styles, états et duplications ;
- produire un tableau `garder / simplifier / refondre / supprimer` ;
- identifier les 10 plus gros problèmes UX ;
- ne modifier aucun fichier produit.

### `plan`

Découper la refonte en lots visuels indépendants :

- DS-01 tokens + primitives ;
- DS-02 shell + navigation ;
- DS-03 accueil ;
- DS-04 positions + détail ;
- DS-05 ajout ;
- DS-06 analyse ;
- DS-07 fonds/options ;
- DS-08 réglages/états ;
- DS-09 polish, motion, accessibilité, PWA/iPhone.

### `execute`

Implémenter lot par lot. Ne jamais faire une réécriture aveugle de toute l’app en un commit.

Pour chaque lot :

1. capture BEFORE aux tailles cibles ;
2. tests fonctionnels existants verts ;
3. modification du design ;
4. capture AFTER ;
5. comparaison visuelle ;
6. vérification 390×844, 430×932, tablette, desktop ;
7. tests clavier et reduced motion ;
8. lint, typecheck, tests et build ;
9. mise à jour STATUS ;
10. commit atomique.

### `verify`

Faire un audit final sans complaisance : cohérence, densité, contrastes, responsive, états, lisibilité financière, accessibilité et absence de régression métier.

## 8. Règle de simplification

Pour chaque élément visible, poser :

- Est-il nécessaire quotidiennement ?
- Est-il compréhensible sans explication ?
- Peut-il être secondaire ou progressif ?
- Est-il dupliqué ailleurs ?

Si une information n’aide pas une décision ou une compréhension immédiate, la déplacer dans le détail plutôt que la supprimer si elle est utile à l’audit financier.

## 9. Données live et mouvement

- changement de prix : transition 150–250 ms ;
- flash positif/négatif très discret, une seule fois ;
- respecter `prefers-reduced-motion` ;
- aucun clignotement continu ;
- badge de fraîcheur compact ;
- `LIVE`, `NAV`, `STALE` restent toujours discernables par texte, pas seulement couleur.

## 10. Definition of Done design

La refonte n’est terminée que si :

- les fonctions existantes sont préservées ;
- aucun calcul financier n’a changé sans justification ;
- toutes les routes principales ont une hiérarchie cohérente ;
- l’accueil se comprend en moins de 5 secondes ;
- aucune route principale ne déborde horizontalement à 390 px ;
- cibles tactiles ≥44 px ;
- contraste AA ;
- les captures BEFORE/AFTER existent ;
- les tests existants restent verts ;
- le build passe ;
- la revue finale vérifie également les états vide, erreur, loading, offline, stale et unavailable.

## 11. Git

Créer une branche dédiée `claude/portfolio-lab-design-v2` ou des branches `claude/portfolio-lab-design-ds-XX-*` si la taille l’exige.

Ne toucher qu’à `projects/portfolio-lab/` sauf documentation/skill explicitement nécessaire. Ouvrir une PR avec captures et checklist. Ne pas déployer.
