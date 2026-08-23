# Runbook de reprise — PortfolioLab

Procédures à suivre quand quelque chose ne va pas. Chaque section décrit un
symptôme observable, pas une cause supposée.

Ce document couvre une installation **personnelle mono-instance**. Il ne
prétend pas décrire une exploitation en haute disponibilité, et le dire évite
de s'appuyer dessus dans un contexte qu'il ne couvre pas.

---

## Avant tout : ce qui n'est jamais perdu, et ce qui l'est

| Donnée                       | Où elle vit                  | Reconstituable ?                      |
| ---------------------------- | ---------------------------- | ------------------------------------- |
| Comptes, positions, contrats | PostgreSQL                   | uniquement depuis une sauvegarde      |
| Historique du patrimoine     | `portfolio_snapshots`        | **non** — chaque point est une mesure |
| Cours, taux de change        | fournisseur, jamais persisté | oui, au prochain chargement           |
| Référentiel d'instruments    | PostgreSQL, partagé          | oui, par le seed ou une résaisie      |

L'historique est le seul élément **irremplaçable**. Un point de patrimoine a
été calculé à une date, avec les cours et les taux de ce jour-là ; aucun
recalcul ultérieur ne le retrouve. C'est ce qui rend la sauvegarde régulière
utile, et une restauration partielle insuffisante.

---

## Sauvegarder

Réglages → **Télécharger ma sauvegarde**, ou directement :

```bash
curl -b "<cookie de session>" https://<hôte>/api/export -o sauvegarde.json
```

Le fichier contient les comptes, les positions, les contrats d'option et
l'historique. Il ne contient **aucun** cours : ce sont des données de marché,
différentes au prochain chargement, et les inclure ferait croire que la
sauvegarde fige une valorisation.

Il est lisible en clair. Il ne contient ni identifiant bancaire, ni mot de
passe, ni clé d'API — mais il contient le patrimoine. Conservez-le comme un
relevé.

> **Restauration.** L'import n'est pas implémenté. La sauvegarde permet
> aujourd'hui de repartir manuellement, pas de recharger l'état d'un clic.
> Le dire explicitement vaut mieux que laisser croire à une restauration
> automatique qui n'existe pas.

---

## Symptôme : « Données indisponibles » sur tous les écrans

L'application ne joint plus PostgreSQL.

1. Vérifier que la base répond :
   ```bash
   psql "$DATABASE_URL" -c "select 1"
   ```
2. Si la commande échoue, le problème est en amont de l'application : base
   arrêtée, réseau, identifiants. L'application ne peut rien y faire.
3. Si elle réussit, vérifier que le processus web voit la **même** variable :
   une valeur différente entre le shell et le service est la cause la plus
   fréquente.

L'application reste consultable dans cet état et l'annonce. Elle
n'affiche **aucune** donnée plutôt qu'un total partiel.

---

## Symptôme : le patrimoine affiché a baissé sans raison

Regarder d'abord l'accueil : les positions non valorisables y sont annoncées
explicitement, avec leur motif.

- **« aucun cours disponible »** — l'instrument n'est pas résolu par le
  fournisseur actif. Attendu tant qu'aucun fournisseur réel n'est branché.
- **« aucun taux de change »** — la devise de la position n'a pas de taux vers
  le CHF.

Ces positions sont **exclues** du total, jamais comptées à zéro. Le total est
donc incomplet, pas faux — et l'écran le dit.

Vérifier ensuite le panneau **Réconciliation** de l'écran Analyse. S'il
signale un écart, les chiffres ne sont pas fiables : c'est un défaut du moteur,
à traiter avant toute autre chose.

---

## Symptôme : la courbe du patrimoine a disparu

Trois causes possibles, dans l'ordre de fréquence :

1. **Moins de deux points.** L'écran le dit. Il n'y a rien à réparer.
2. **Série non comparable.** L'historique mêle deux versions du moteur de
   calcul, ou deux devises de consolidation. C'est délibéré : superposer des
   points issus de formules différentes dessinerait une marche qui ne
   correspond à aucun mouvement de patrimoine.
   ```sql
   select distinct calculation_version, base_currency from portfolio_snapshots;
   ```
   Décider quoi faire des anciens points est une **décision produit** : les
   convertir revient à réécrire une mesure. Ne pas le faire par réflexe.
3. **Aucun point enregistré** parce que le portefeuille n'a aucune position
   valorisable. Enregistrer un patrimoine de zéro creuserait la courbe là où
   il n'y a qu'une absence de cours ; l'application refuse donc de le faire.

---

## Symptôme : « Trop de demandes » (429)

La limitation de débit s'est déclenchée. Les compteurs sont **en mémoire du
processus** : redémarrer le service les remet à zéro.

| Route              | Limite          |
| ------------------ | --------------- |
| `/api/live-token`  | 20 par minute   |
| `/api/export`      | 10 par minute   |
| Suppression totale | 3 par 5 minutes |

Si la limite gêne un usage normal, c'est la limite qu'il faut revoir
(`apps/web/src/lib/security/limits.ts`), pas la contourner.

---

## Symptôme : l'application affiche des chiffres périmés

Chercher le bandeau **Hors ligne**. S'il est présent, la page vient du cache du
service worker et son âge est affiché ; c'est le comportement attendu.

S'il est **absent** alors que la page semble figée, le service worker sert
peut-être une version obsolète :

1. Recharger en contournant le cache.
2. Si le problème persiste, désinscrire le service worker depuis les outils de
   développement, onglet Application, puis recharger.
3. La constante `VERSION` de `apps/web/public/sw.js` change les noms de cache ;
   l'incrémenter force la purge des anciens à la prochaine activation.

---

## Symptôme : aucun composant interactif ne réagit

Formulaires qui se soumettent mais boutons inertes, cases qui ne cochent rien.

Ouvrir la console du navigateur et chercher une erreur de **Content Security
Policy**. Un `script-src` trop strict fait refuser tout le bundle client :
l'application continue de s'afficher — le rendu serveur suffit — et les
formulaires continuent de fonctionner par soumission native. Le symptôme est
donc partiel, et facile à ne pas voir.

C'est arrivé une fois, en développement : `next dev` compile avec des source
maps en `eval()`, que la politique interdisait. La politique de développement
autorise désormais `'unsafe-eval'` ; celle de production ne l'autorise jamais,
et un test E2E le vérifie dans les deux sens.

---

## Symptôme : suspicion de fuite de secret

1. **Ne pas** copier le secret suspect dans un ticket, un message ou un commit.
2. Faire tourner le scan sur tout l'historique :
   ```bash
   gitleaks detect --no-banner --redact --exit-code 1
   ```
3. Si un secret a réellement été exposé, il est compromis dès cet instant :
   le faire tourner chez le fournisseur. Retirer le commit ne suffit pas — il
   a pu être cloné.
4. Vérifier qu'aucun `.env` n'est suivi :
   ```bash
   git ls-files '*.env' '.env' '.env.*' | grep -v '\.env\.example$'
   ```

Les journaux, eux, expurgent par **valeur** et pas seulement par nom de champ :
une clé recopiée dans un message d'erreur fournisseur est remplacée elle aussi.
Les montants et les identifiants sont expurgés ou raccourcis pour la même
raison — un journal doit permettre de corréler, pas de reconstituer un
patrimoine.

---

## Symptôme : suppression déclarée incomplète

L'écran de suppression compte les lignes restantes après coup, table par table,
et refuse d'annoncer un succès s'il en reste. Ce message signale une cascade
défaillante, pas une erreur de l'utilisateur.

```sql
select 'portfolios' as t, count(*) from portfolios
union all select 'accounts', count(*) from accounts
union all select 'positions', count(*) from positions
union all select 'transactions', count(*) from transactions
union all select 'portfolio_snapshots', count(*) from portfolio_snapshots;
```

Les contraintes de clé étrangère déclarent `on delete cascade` depuis
`portfolios`. Une ligne subsistante signifie qu'une contrainte a été modifiée :
la corriger dans une migration, et ne pas supprimer à la main table par table —
ce qui masquerait le défaut jusqu'à la prochaine fois.

---

## Repartir d'une base vide

```bash
createdb portfolio_lab
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Le seed (`supabase/seed.sql`) contient **uniquement** des données fictives et
n'est jamais appliqué en production. Il sert aux tests et à une prise en main
locale.
