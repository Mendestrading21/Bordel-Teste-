# PortfolioLab — UX et interface

## Direction visuelle

Style : **obsidienne sombre, cuivre discret, premium et institutionnel**.

Le produit doit évoquer une application patrimoniale sérieuse, pas un casino de trading et pas une copie dense de Bloomberg.

## Tokens initiaux

Définir des tokens sémantiques plutôt que des couleurs dispersées :

- `background-canvas`
- `background-surface`
- `background-elevated`
- `border-subtle`
- `text-primary`
- `text-secondary`
- `accent-copper`
- `positive`
- `negative`
- `warning`
- `stale`

Les valeurs exactes sont validées visuellement dans le lot design. Respecter un contraste accessible ; le cuivre n’est pas utilisé pour de longs textes.

## Navigation mobile

Barre inférieure recommandée :

1. Accueil
2. Positions
3. Ajouter
4. Analyse
5. Réglages

Le bouton Ajouter reste central et évident, sans flotter au-dessus des informations importantes.

## Accueil

Ordre de lecture :

1. patrimoine total en CHF ;
2. variation du jour ;
3. P&L latent et capital investi ;
4. allocation synthétique ;
5. principales positions ;
6. santé des données si une anomalie existe.

Ne pas afficher dix cartes KPI équivalentes. Une information principale, deux ou trois secondaires, puis le détail.

## Carte position

Contenu minimum :

- symbole ou nom court ;
- nom complet secondaire ;
- type et compte ;
- cours natif ;
- variation ;
- valeur CHF ;
- P&L latent ;
- badge de fraîcheur si autre que live.

Le changement de cours peut provoquer un flash très bref et accessible. Respecter `prefers-reduced-motion`.

## Badges de données

Libellés utilisateur :

| Interne | Affichage |
|---|---|
| LIVE | En direct |
| DELAYED | Différé |
| EOD | Dernière clôture |
| NAV | Dernière NAV |
| MANUAL | Manuel |
| STALE | Donnée périmée |
| UNAVAILABLE | Indisponible |

Un tooltip ou détail indique source et horodatage exacts.

## Flux Ajouter — action/ETF/fonds

### Recherche

Champ unique : `Nom, ticker ou ISIN`.

Chaque résultat affiche :

- nom ;
- ticker ou ISIN ;
- type ;
- place ;
- devise ;
- fournisseur ayant résolu l’instrument.

En cas d’ambiguïté, l’utilisateur choisit. Ne jamais sélectionner automatiquement une classe de parts de fonds proche.

### Position

Champs requis :

- compte ;
- quantité ;
- coût moyen unitaire ;
- devise du coût.

Champs optionnels : date, notes.

Une prévisualisation montre coût total, valeur actuelle estimée, devise et source.

## Flux Ajouter — option

Écran guidé, pas de saisie brute obligatoire :

1. sous-jacent ;
2. call/put ;
3. échéance ;
4. strike ;
5. contrat exact ;
6. quantité et prime moyenne.

Afficher clairement :

- symbole canonique ;
- multiplicateur ;
- bid/ask/mark ;
- devise ;
- délai des données ;
- jours avant échéance.

La saisie directe d’un symbole OSI peut être ajoutée comme raccourci expert.

## Fonds

La fiche fonds met en avant :

- nom et classe de parts ;
- ISIN ;
- devise ;
- dernière NAV ;
- date de NAV ;
- fréquence attendue ;
- source.

Ne pas afficher une pulsation live ou une heure intraday trompeuse.

## Graphiques

- historique du patrimoine ;
- historique de la position ;
- allocation par classe et compte ;
- contribution au P&L.

Toujours fournir une alternative textuelle et des valeurs lisibles. Les graphiques ne remplacent pas les chiffres.

## Responsive

Cibles minimales de vérification :

- 390 × 844 ;
- 430 × 932 ;
- tablette ;
- desktop standard.

La conception prioritaire est le téléphone. Aucun tableau ne doit nécessiter un zoom horizontal pour l’usage principal.

## Accessibilité

- zones tactiles d’au moins 44 px ;
- navigation clavier fonctionnelle ;
- labels explicites ;
- contraste AA ;
- états non communiqués uniquement par la couleur ;
- support de `prefers-reduced-motion` ;
- messages d’erreur associés aux champs ;
- annonce accessible des mises à jour live importantes sans spam.

## États vides

Premier démarrage : expliquer en trois phrases le fonctionnement et proposer `Ajouter mon premier placement`.

Aucun résultat : proposer de vérifier ticker/ISIN, changer la place ou ajouter une valeur manuelle. Ne jamais inventer un instrument.

## Ton rédactionnel

Français clair, professionnel et direct. Éviter les slogans spéculatifs, les recommandations et tout vocabulaire promettant un rendement.
