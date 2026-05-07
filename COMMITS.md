# Commits atomiques — fix/audit-app-stability

Pour appliquer cette PR en commits propres et reviewables, voici la séquence recommandée.
Chaque commit est indépendant — vous pouvez les appliquer dans l'ordre via `git apply`
ou en sélectionnant les hunks correspondants dans votre IDE.

> ⚠️ Avant de commiter : créer la branche
> ```bash
> git checkout -b fix/audit-app-stability
> ```

---

## Commit 1 — `fix(transactions): édition atomique avec rollback`

**Fichiers :** `index.html`, `SUPABASE_TOUT_EN_UN.sql`

**Message :**
```
fix(transactions): édition atomique avec rollback de l'original si échec

Avant : saveTx en mode édition supprimait puis recréait la transaction.
Si la recréation échouait (réseau, RLS, compte supprimé), l'opération
originale était définitivement perdue sans rollback possible.

Après :
- Nouvelle RPC SQL update_transaction_secure qui ajuste le solde et
  met à jour la transaction en une seule transaction PostgreSQL.
- Côté client, saveTx tente d'abord la RPC. Fallback sur la séquence
  delete+add avec restauration de l'original si tentative 2 échoue.
- Plus aucun chemin n'aboutit à une perte silencieuse.
```

---

## Commit 2 — `fix(home): charger calendar_events au démarrage`

**Fichier :** `index.html` (`loadAll`)

**Message :**
```
fix(home): charger calendar_events au démarrage pour widget upcoming et équité

Avant : loadAll() ne chargeait pas les événements du calendrier. Conséquences :
- Le widget "Prochains événements" sur l'accueil était toujours vide tant que
  l'utilisateur n'avait pas ouvert l'onglet Agenda.
- Le calcul d'équité (calcEquity → calHours) ne comptait pas les heures
  d'agenda → équité fausse à la première ouverture.

Après : chargement des événements du mois courant + suivant en parallèle dans
loadAll(), comme pour tasks/shop/accounts.
```

---

## Commit 3 — `fix(calendar): fusionner events au lieu de remplacer`

**Fichier :** `index.html` (`loadCalEvents`)

**Message :**
```
fix(calendar): fusionner les events au lieu de remplacer A.calEvents

Avant : naviguer vers un autre mois remplaçait A.calEvents. Les événements
de la semaine courante disparaissaient du state, faussant le calcul d'équité.

Après : fusion par id via Map. On garde tout ce qui a été chargé.
```

---

## Commit 4 — `fix(meals): confirmation avant suppression de repas`

**Fichier :** `index.html` (`delMeal`)

**Message :**
```
fix(meals): confirmation avant suppression de repas

Tous les autres del* (delT, delShop, delTx, delCalEvent, delAccount) demandent
confirmation. delMeal était la seule exception, ce qui rendait possible la
perte d'un repas par clic accidentel sur la croix ✕.

Ajout du confirm() + toast de confirmation pour cohérence.
```

---

## Commit 5 — `feat(tasks): bouton 🤝 Aider sur les tâches du partenaire`

**Fichier :** `index.html` (`buildTC`)

**Message :**
```
feat(tasks): bouton "🤝 Aider" sur les tâches du partenaire

La column helper_id existait dans la DB et était comptée dans calcEquity,
mais aucune UI ne permettait de l'utiliser → code mort.

Ajout dans buildTC :
- Sur une tâche prise par le partenaire sans helper, bouton "🤝 Aider".
- Si on est déjà helper, bouton "🤝 J'aide · annuler".
- Tag visuel "🤝 partenaire aide" si quelqu'un aide.
- aria-label explicites pour l'accessibilité.

Les fonctions joinTask/leaveTask étaient déjà définies mais jamais appelées,
maintenant branchées.
```

---

## Commit 6 — `fix(budget): détection abonnements safe pour montants 0`

**Fichier :** `index.html` (`detectSubscriptions`)

**Message :**
```
fix(budget): exclure les transactions à montant 0 de la détection d'abonnement

Le calcul de tolérance ±5% (Math.abs(a-avg)/avg) divise par avg, qui peut être
0 si toutes les transactions du groupe sont à 0. Filtrage en amont pour éviter
NaN et faux négatifs silencieux.
```

---

## Commit 7 — `fix(meals): déduplication ingrédients robuste aux accents`

**Fichier :** `index.html` (`addIngrToShop`)

**Message :**
```
fix(meals): normaliser les noms d'ingrédients (NFD) lors de l'ajout aux courses

Avant : "Pâtes" et "pates" étaient considérés différents → doublon créé.
Après : normalisation NFD + suppression des accents pour comparer, comme
dans _normTitle utilisé pour la détection d'abonnements.
```

---

## Commit 8 — `fix(security): sanitize couleurs sur tous les writes DB`

**Fichier :** `index.html` (`saveCalEvent`, `saveAccount`)

**Message :**
```
fix(security): sanitizeColor systématique sur les writes vers la DB

saveCalEvent et saveAccount envoyaient la couleur sélectionnée directement
à la base sans passer par sanitizeColor. La DB calendar_events a une
contrainte regex (rejet côté serveur), mais accounts.color n'a aucune
contrainte → injection CSS possible si un dev bypass le <select>.

Ajout de sanitizeColor + fallback hex valide côté client (double protection).
```

---

## Commit 9 — `fix(crypto): garde nulle dans confirmPartnerKeyChange`

**Fichier :** `index.html` (`confirmPartnerKeyChange`)

**Message :**
```
fix(crypto): protéger confirmPartnerKeyChange si A.partner ou A.user null

Si l'utilisateur clique sur "Confirmer la nouvelle clé" alors que A.partner
n'est plus chargé (cas de course rare), accès à .id sur null → crash.

Ajout d'une garde defensive en début de fonction.
```

---

## Commit 10 — `feat(account): suppression de compte RGPD complète`

**Fichiers :** `index.html` (`delAccount`), `SUPABASE_TOUT_EN_UN.sql`

**Message :**
```
feat(account): RPC delete_my_account pour effacement RGPD complet

Avant : delAccount supprimait juste profiles. Le compte auth.users restait,
empêchant l'utilisateur de se réinscrire avec le même email.

Ajouts :
- RPC SQL delete_my_account() qui efface profile (cascade vers tasks/budget/
  messages/etc), supprime le couple si l'user était seul, et logge l'action.
- Côté client : appel RPC avec fallback graceful sur l'ancien comportement
  si la RPC n'est pas encore déployée.
- Fermeture propre du canal realtime avant suppression.

Note : suppression effective dans auth.users nécessite service_role
(limite SDK client) — documenté dans DEPLOY.md, à traiter via cron admin.
```

---

## Commit 11 — `fix(rls): policies explicites refus writes directs sur transactions`

**Fichier :** `SUPABASE_TOUT_EN_UN.sql`

**Message :**
```
fix(rls): policies explicites de refus pour les writes directs sur transactions

Avant : seule tx_select existait. Une écriture directe via
sb.from('transactions').insert() était silencieusement rejetée par PG —
les futurs devs perdaient du temps à débugger des "rien ne se passe".

Après : policies tx_block_direct_insert/update/delete avec check(false).
Le design intentionnel devient explicite : toute écriture passe par les
RPC security definer (add/update/delete_transaction_secure).
```

---

## Commit 12 — `chore: suppression code mort + bump version`

**Fichier :** `index.html`

**Message :**
```
chore: suppression code mort dans editAccount + bump v4.1 → v4.2

- editAccount avait un querySelector || querySelector sans assignation
  (les 2 expressions évaluées et jetées). Suppression.
- Footer settings : v4.1 → v4.2.
```

---

## Commit 13 — `feat(pwa): service worker + page offline`

**Fichiers ajoutés :** `sw.js`, `offline.html`, `_headers`, `_redirects`

**Message :**
```
feat(pwa): service worker complet avec stratégies différenciées + page offline

Le code dans index.html enregistrait /sw.js mais le fichier n'était pas
fourni dans le repo → SW silencieusement absent en prod.

Ajouts :
- sw.js : cache-first pour shell, network-first pour Supabase (jamais cachées),
  cache-first + revalidation pour CDN externes, fallback offline.html.
- offline.html : page autonome (zéro dépendance), reload auto au retour réseau.
- _headers Netlify : SW no-cache obligatoire, manifest court, icônes long-cache,
  headers sécurité (X-Frame-Options, nosniff, etc.).
- _redirects Netlify : SPA fallback + accès direct préservé pour assets PWA.
```

---

## Commit 14 — `docs: AUDIT.md, DEPLOY.md, PR.md, CHANGELOG v4.2`

**Fichiers :** `AUDIT.md`, `DEPLOY.md`, `PR.md`, `CHANGELOG.md`, `CHANGELOG-v4.1.md`

**Message :**
```
docs: rapport d'audit, guide de déploiement, et changelog v4.2

- AUDIT.md : liste exhaustive des 23 points audités, classés par priorité,
  avec correction appliquée ou justification de non-correction.
- DEPLOY.md : procédure pas-à-pas Netlify + Supabase, checklist post-deploy,
  procédure de rollback.
- PR.md : description structurée pour la pull request.
- CHANGELOG.md : v4.2 avec détails techniques.
- CHANGELOG-v4.1.md : ancienne version conservée pour traçabilité.
```

---

## Application en une seule passe (alternative)

Si vous préférez tout appliquer en un seul commit (squash merge à la fin) :

```
chore: audit complet v4.2 — stabilité, intégrité, équité, PWA offline

Couvre 14 fixes identifiés par audit statique du fichier monolithique
index.html (3651 lignes) + schéma Supabase. Détails dans CHANGELOG.md
et AUDIT.md. Voir PR.md pour la liste structurée et DEPLOY.md pour
la procédure de mise en production.

Highlights :
- fix(transactions): édition atomique via RPC update_transaction_secure
- fix(home): widget upcoming + équité justes dès la 1re visite
- fix(meals): confirm() avant suppression
- feat(tasks): bouton "🤝 Aider" enfin branché
- feat(account): RPC delete_my_account RGPD-complète
- fix(rls): policies explicites refus writes directs sur transactions
- feat(pwa): sw.js + offline.html + headers Netlify
```
