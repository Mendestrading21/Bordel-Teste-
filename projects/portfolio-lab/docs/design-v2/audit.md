# Design V2 — Audit UI

Base : `main` à `cf90119`. Aucun fichier produit modifié pour produire cet audit.
Captures de référence : `docs/screenshots/design-v2/before/` (24 fichiers, 3 tailles × 8 écrans).

---

## 1. Inventaire

### Routes — 9 écrans + 2 routes d'API

| Route                            | Rôle                           | Verdict                        |
| -------------------------------- | ------------------------------ | ------------------------------ |
| `/`                              | Accueil / patrimoine           | **refondre**                   |
| `/positions`                     | Liste                          | **refondre**                   |
| `/positions/[id]`                | Fiche détaillée                | **refondre**                   |
| `/ajouter`                       | Ajout d'une position           | **refondre**                   |
| `/ajouter/option`                | Parcours option guidé          | simplifier                     |
| `/analyse`                       | Allocations, historique, P&L   | simplifier                     |
| `/fonds`                         | Fonds et NAV                   | simplifier                     |
| `/reglages`                      | Comptes, fournisseurs, données | **refondre**                   |
| `/hors-ligne`                    | Secours hors ligne             | garder                         |
| `/api/export`, `/api/live-token` | Données                        | garder — hors périmètre design |

### Composants — 27 fichiers, 1 791 lignes

| Composant                                                                | Verdict      | Motif                                                       |
| ------------------------------------------------------------------------ | ------------ | ----------------------------------------------------------- |
| `money.tsx` (`Money`, `Percent`, `Quantity`, `Unavailable`)              | **garder**   | primitive saine, formatage déjà centralisé                  |
| `freshness-badge.tsx`                                                    | simplifier   | doit devenir compact ; le texte reste obligatoire           |
| `bottom-nav.tsx`, `nav-items.ts`, `nav-icon.tsx`                         | **refondre** | 5 destinations correctes, mais `Ajouter` doit être accentué |
| `page-header.tsx` (11 lignes)                                            | **refondre** | produit le header de 150 px à supprimer                     |
| `empty-state.tsx`                                                        | garder       | contrat correct, à re-styler seulement                      |
| `demo-banner.tsx`                                                        | **refondre** | 160 px sur **chaque** écran — voir problème n° 1            |
| `data-health.tsx`                                                        | simplifier   | n'apparaître que s'il y a une anomalie                      |
| `wealth-chart.tsx` (208 l.)                                              | garder       | logique de tracé correcte, habillage à revoir               |
| `pnl-contributions.tsx`, `option-exposure.tsx`, `reconciliation.tsx`     | simplifier   | à regrouper : « une carte = une question »                  |
| `add-position-form.tsx` (167 l.), `edit-position-form.tsx` (134 l.)      | **refondre** | formulaire à plat ; pas de divulgation progressive          |
| `account-forms.tsx`, `data-management.tsx`, `delete-position-form.tsx`   | simplifier   | re-styler, isoler la zone danger                            |
| `form-status.tsx`, `session-notice.tsx`, `snapshot-form.tsx`             | garder       |                                                             |
| `offline-*.tsx`, `service-worker-registration.tsx`, `live-indicator.tsx` | garder       | **ne pas toucher** : logique Lot 09 vérifiée                |
| `nav-items.test.ts`, `offline-age.test.ts`                               | garder       |                                                             |

### Styles

Aucune primitive `Card` : le motif `rounded-token-lg border border-subtle bg-surface` est **recopié dans 10 fichiers**. `text-secondary` apparaît 65 fois, `border-subtle` 30. Chaque changement de surface demande donc dix éditions — c'est la source de duplication n° 1.

Tokens actuels (`packages/ui/src/tokens.css`) : 11 couleurs, canvas `#0b0e11` neutre, accent cuivre `#c87f4a`. Pas de niveau `surface-2`/`surface-3`, pas de token `info`, pas d'échelle typographique, pas d'échelle de rayons au-delà de 3 valeurs.

---

## 2. Les dix plus gros problèmes UX

Classés par coût pour l'utilisateur quotidien.

### 1. Le bandeau de démonstration mange 160 px sur les neuf écrans

Cinq lignes de texte explicatif, répétées à chaque navigation. Le brief l'interdit deux fois : « gros blocs explicatifs sur le dashboard » et « éviter un header de 200 px avant la première donnée utile ». **Sur 390×844, le patrimoine total n'apparaît qu'au pixel 290.**

### 2. Le premier viewport de l'accueil ne contient presque rien d'utile

Attendu par le brief : titre compact, patrimoine, variation du jour, mini-courbe, trois raccourcis, début de la liste. Constaté : titre, sous-titre, bandeau démo, patrimoine, puis **une seule** métrique. Ni courbe, ni raccourcis, ni positions.

### 3. Les métriques sont trois cartes pleine largeur empilées

P&L, Performance et Capital investi occupent trois fois 78 px pour trois nombres courts. Une rangée compacte suffirait.

### 4. « Variation du jour » est un paragraphe, pas un chiffre

Niveau 1 de la hiérarchie du brief, rendu en trois lignes de prose grise. L'explication doit devenir un état compact, pas occuper la place du nombre.

### 5. Aucune recherche ni filtre sur `/positions`

L'IA cible impose une recherche immédiate et des chips `Toutes / 📈 Actions / 🧺 ETF / 🎯 Options / 🏦 Fonds / 💵 Cash`. Aujourd'hui : liste brute, tri figé. Priorité produit n° 3 (« retrouver une position en 1 geste ») non tenue.

### 6. Chaque position est une carte autonome

Cinq positions = cinq cartes bordées = deux écrans de défilement. Les noms tronquent (« Démo Technologies In… »). Une liste dense dans une seule carte tiendrait en un viewport.

### 7. L'accent cuivre n'est pas la direction demandée

Le brief demande une chartreuse/lime adoucie pour CTA, onglet actif, focus et point clé de graphique. Le cuivre `#c87f4a` est proche du warning `#e0a458` — deux rôles différents à teinte voisine.

### 8. Le fond est neutre, pas bleu-nuit

`#0b0e11` est un gris très sombre. Le système cible demande `#050B14`–`#07101D`, et surtout **trois** niveaux de surface là où il n'y en a que deux exploités.

### 9. Le formulaire d'ajout montre tout d'un coup

Neuf champs, dont multiplicateur et devise du cours, avant même de savoir si l'utilisateur ajoute une action ou une option. L'IA cible impose un choix de type d'abord, puis divulgation progressive.

### 10. `/analyse` est un empilement de cartes de même poids

Quatre blocs d'allocation au même niveau visuel, plus contribution, exposition et réconciliation. Aucun sélecteur de période. « Une carte = une question » n'est pas respecté.

---

## 3. Ce qui ne doit pas bouger

Vérifié : ces modules sont hors périmètre design et ne seront pas touchés.

| Domaine                         | Fichiers                                                 |
| ------------------------------- | -------------------------------------------------------- |
| Moteur décimal                  | `packages/domain/src/decimal.ts`                         |
| Valorisation et analyse         | `packages/portfolio-engine/src/*.ts`                     |
| NAV, mark options, fournisseurs | `packages/market-data/src/*.ts`                          |
| RLS, migrations, repositories   | `supabase/migrations/*`, `packages/database/src/*`       |
| Sécurité, expurgation, débit    | `packages/security/src/*`, `apps/web/src/lib/security/*` |
| Données et actions serveur      | `apps/web/src/lib/data/*`                                |
| Hors ligne et service worker    | `offline-*.tsx`, `public/sw.js`                          |

Le formatage (`packages/ui/src/format.ts`) est une primitive de présentation : il peut évoluer, mais **aucune valeur affichée ne doit changer**. Les tests de format existants le garantissent.
