# Matrice de compatibilité — Release candidate 1.0

Ce que PortfolioLab a **réellement** exécuté, et ce qui n'a jamais été essayé.
La distinction est le point de ce document : « non testé » n'est pas
« incompatible », et le présenter comme tel serait aussi trompeur que l'inverse.

---

## Environnement d'exécution

| Composant  | Version testée                      | Statut                       |
| ---------- | ----------------------------------- | ---------------------------- |
| Node.js    | 22.22.2                             | vérifié en local et en CI    |
| pnpm       | 10.4.1                              | épinglé par `packageManager` |
| PostgreSQL | 16.13 (local), 16.15 (CI)           | vérifié                      |
| Ubuntu     | 24.04 (local), `ubuntu-latest` (CI) | vérifié                      |

Node 20 et PostgreSQL 15 n'ont **pas** été essayés. Rien dans le code ne les
exclut a priori — les migrations n'utilisent aucune fonctionnalité postérieure
à PostgreSQL 15 — mais rien ne l'a vérifié non plus.

## Bibliothèques principales

| Bibliothèque | Version résolue |
| ------------ | --------------- |
| Next.js      | 15.5.23         |
| React        | 19.2.8          |
| Tailwind CSS | 4.3.3           |
| TypeScript   | 5.7.x           |
| Vitest       | 3.2.7           |
| Playwright   | 1.62.x          |
| decimal.js   | 10.4.x          |
| Zod          | 3.24.x          |

`postcss` et `sharp` sont contraints par `pnpm.overrides` au-delà de ce que
`next` réclame, pour corriger cinq avis de sécurité transitifs. Le build a été
vérifié avec ces versions forcées.

---

## Navigateurs

| Navigateur    | Gabarit                    | Statut                           |
| ------------- | -------------------------- | -------------------------------- |
| Chromium 1194 | 390 × 844 (iPhone 14/15)   | **vérifié** — suite E2E complète |
| Chromium 1194 | 430 × 932 (iPhone Pro Max) | **vérifié** — suite E2E complète |
| Chromium 1194 | 768 × 1024 (tablette)      | **vérifié** — suite E2E complète |
| Chromium 1194 | 1280 × 900 (desktop)       | **vérifié** — suite E2E complète |
| Safari iOS    | —                          | **jamais exécuté**               |
| Firefox       | —                          | **jamais exécuté**               |

### Safari iOS mérite une mention particulière

C'est la cible réelle du produit : l'installation sur écran d'accueil d'un
iPhone ne passe que par Safari. Or **aucun test n'y a tourné**. Les gabarits
« iPhone » ci-dessus sont des dimensions rendues par Chromium, pas WebKit.

Points où Safari diffère notablement et qui restent donc non vérifiés :

- comportement du service worker en application installée ;
- `env(safe-area-inset-*)` sur appareil à encoche ;
- rendu des dates et nombres, qui suit les données ICU du système ;
- persistance du cache, que iOS peut purger plus agressivement.

C'est la vérification la plus utile à mener avant tout usage quotidien.

---

## Fournisseurs de données de marché

| Fournisseur        | Adaptateur    | Appel réel | Statut                            |
| ------------------ | ------------- | ---------- | --------------------------------- |
| Fournisseur simulé | implémenté    | sans objet | **vérifié** — suite de conformité |
| Twelve Data        | **non écrit** | jamais     | `UNVERIFIED`                      |
| Massive            | **non écrit** | jamais     | `UNVERIFIED`                      |
| EODHD              | **non écrit** | jamais     | `UNVERIFIED`                      |
| OpenFIGI           | **non écrit** | jamais     | `UNVERIFIED`                      |

Deux causes cumulées : aucune clé fournie, et l'accès réseau à ces domaines
refusé par la politique de sortie de l'environnement — documentation comprise.

La matrice de couverture rapporte 19 instruments × 4 fournisseurs en `NOT_RUN`.
Jamais `NOT_FOUND` : « pas essayé » et « introuvable » sont deux faits
différents.

---

## Ce qui n'a jamais été exécuté

Liste explicite, pour qu'aucune absence ne passe pour une réussite :

- aucun appel à une API de marché réelle ;
- aucun flux d'authentification, Supabase n'étant pas configuré ;
- aucun déploiement, sur aucune plateforme ;
- aucune exécution sur WebKit ni sur Gecko ;
- aucune exécution sur un appareil physique ;
- aucun test de charge, aucune mesure de performance sous concurrence ;
- aucune exécution multi-instance — la limitation de débit est locale au
  processus et ne le supporterait pas en l'état.
