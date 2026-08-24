# Installation et exploitation — PortfolioLab

Application patrimoniale **personnelle et privée**. Elle ne se connecte à aucune
banque, n'importe aucun compte, ne passe aucun ordre.

> **Avant de commencer.** L'authentification n'est pas implémentée (voir
> `audit-fonctionnel.md`). PortfolioLab ne doit donc **pas** être exposé sur un
> réseau public en l'état : n'importe qui atteignant l'URL atteindrait les
> données. L'usage prévu aujourd'hui est local.

---

## 1. Prérequis

| Outil      | Version | Vérifier         |
| ---------- | ------- | ---------------- |
| Node.js    | ≥ 22    | `node --version` |
| pnpm       | 10.4.1  | `pnpm --version` |
| PostgreSQL | ≥ 16    | `psql --version` |

PostgreSQL 16 est la version testée, en CI comme en local. Les migrations
n'utilisent rien de postérieur, mais rien de plus ancien n'a été vérifié.

---

## 2. Démarrage rapide

Depuis un dépôt fraîchement cloné :

```bash
cd projects/portfolio-lab
pnpm install
createdb portfolio_lab
export DATABASE_URL="postgresql://$USER@localhost:5432/portfolio_lab"

pnpm run demo                              # migrations + données fictives
PORTFOLIO_LAB_DEMO_MODE=true pnpm run dev  # http://localhost:3100
```

`pnpm run demo` charge un portefeuille fictif, pour regarder l'application
fonctionner. Pour partir d'une base vide et saisir ses propres positions :

```bash
pnpm run setup    # migrations seulement
pnpm run dev
```

Les deux sont **idempotents** : les relancer sur une base déjà prête n'efface
rien et n'échoue pas. Ils passent par le même runner de migrations que les
tests, qui enregistre ce qu'il a appliqué et détecte une migration modifiée
après coup.

`createdb` reste à votre charge : les droits et la méthode de connexion varient
trop d'une installation à l'autre pour être devinés, et échouer là-dessus au
milieu d'un script laisserait un état à moitié préparé.

Le détail de chaque étape suit.

## 3. Installation manuelle

```bash
git clone <dépôt>
cd projects/portfolio-lab
pnpm install
```

`pnpm install` suffit : le dépôt est un workspace pnpm dont la racine est
`projects/portfolio-lab/`, pas la racine du dépôt.

---

## 4. Base de données

```bash
createdb portfolio_lab

export DATABASE_URL="postgresql://<utilisateur>@localhost:5432/portfolio_lab"

for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Les migrations s'appliquent dans l'ordre lexicographique de leurs noms. Elles
sont vérifiées reproductibles **depuis une base vide** par un test
d'intégration, à chaque exécution de la CI.

### Données de démonstration — facultatif

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

Tout y est fictif : ISIN en `XX` (préfixe jamais attribué à un émetteur réel),
noms préfixés « Démo », cours inventés. Le seed n'est **jamais** appliqué
automatiquement.

---

## 5. Variables d'environnement

Toutes sont documentées dans `.env.example`. Aucune valeur réelle n'est versionnée.

| Variable                                          | Requise | Rôle                                                                      |
| ------------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                                    | oui     | connexion PostgreSQL                                                      |
| `PORTFOLIO_LAB_DEMO_MODE`                         | non     | `true` active le mode démonstration — **refusé si `NODE_ENV=production`** |
| `LOG_LEVEL`                                       | non     | `debug` \| `info` (défaut) \| `warn` \| `error`                           |
| `MARKET_GATEWAY_SHARED_SECRET`                    | non     | ≥ 32 caractères ; sans lui le canal temps réel répond 503                 |
| `NEXT_PUBLIC_SUPABASE_URL`                        | non     | authentification, non implémentée                                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                   | non     | authentification, non implémentée                                         |
| `TWELVE_DATA_API_KEY` et autres clés fournisseurs | non     | **aucun adaptateur ne les lit** — voir plus bas                           |

### Ajouter une clé fournisseur ne suffit pas

Aucun adaptateur réel n'est implémenté. Les quatre candidats sont enregistrés
avec `create: () => null`, systématiquement : renseigner une clé n'active donc
rien. La procédure complète pour lever ce blocage est dans
`market-data-integration.md`.

C'est délibéré. Un adaptateur écrit sans avoir jamais pu appeler le service
produirait du code qui paraît intégré, et une matrice de couverture qui
rapporterait comme testé ce qui ne l'a jamais été.

---

## 6. Lancer l'application

```bash
pnpm run dev            # développement, port 3100
pnpm run build && pnpm --filter @portfolio-lab/web run start   # production
```

Passerelle de marché, séparément et facultative :

```bash
pnpm run dev:gateway
```

Elle n'est utile qu'avec `MARKET_GATEWAY_SHARED_SECRET` défini. Sans elle,
l'application fonctionne : les cours viennent des fixtures, marqués comme tels.

---

## 7. Vérifier une installation

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit

export DATABASE_URL_TEST="postgresql://<utilisateur>@localhost:5432/portfolio_lab_test"
pnpm run test:integration

pnpm run build
pnpm run test:e2e
```

Sans `DATABASE_URL_TEST`, les suites base de données **s'ignorent** au lieu de
prétendre passer. Un test dédié échoue en CI si la variable manque, pour que
l'oubli soit bruyant.

---

## 8. Installer sur l'écran d'accueil d'un iPhone

Sans App Store, sans compte développeur.

1. ouvrir l'URL de l'application dans **Safari** (ni Chrome ni Firefox : sur
   iOS, seul Safari peut ajouter à l'écran d'accueil) ;
2. bouton **Partager** ;
3. **Sur l'écran d'accueil** ;
4. valider.

L'application s'ouvre alors en plein écran, sans barre d'adresse, avec son icône
et son thème sombre. Le service worker garde les écrans déjà consultés
disponibles hors connexion — assortis d'un bandeau qui annonce leur âge.

Sur une installation locale, l'URL doit être joignable depuis le téléphone :
même réseau, et l'adresse de la machine plutôt que `localhost`.

---

## 9. Exploitation courante

| Tâche                             | Comment                                         |
| --------------------------------- | ----------------------------------------------- |
| Sauvegarder                       | Réglages → **Télécharger ma sauvegarde**        |
| Enregistrer un point d'historique | Analyse → **Enregistrer un point d'historique** |
| Supprimer toutes ses données      | Réglages → recopier `SUPPRIMER`                 |
| Diagnostiquer une panne           | `runbook-reprise.md`                            |
| Vérifier les dépendances          | `pnpm audit --audit-level moderate`             |

L'historique est le seul élément **irremplaçable** : chaque point a été calculé
à sa date avec les cours et taux de ce jour-là, et aucun recalcul ne le
retrouve. Il justifie à lui seul une sauvegarde régulière.
