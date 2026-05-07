# LoadLess — Audit complet (à partir de v4.1)

Date : 2026-05-07
Périmètre : `index.html` (3651 lignes), `manifest.json`, `SUPABASE_TOUT_EN_UN.sql`
Méthode : revue statique ligne par ligne + test de cohérence des callbacks `onclick` + vérif des fonctions
référencées et de la cohérence DB ↔ client.

---

## 🔴 PRIORITÉ 1 — Bugs bloquants ou risques d'intégrité

### B1. `saveTx` en mode édition perd la transaction si l'insert échoue
**Fichier :** `index.html` lignes 2444-2456
**Problème :** En mode édition, on appelle d'abord `delete_transaction_secure` puis `add_transaction_secure`.
Si le second échoue (réseau coupé, RLS bloque, compte supprimé entre-temps), l'opération originale
est **définitivement perdue** sans rollback.
**Correction :** vérifier la réussite du `add` avant de toaster, et si `add` échoue, afficher un message
clair indiquant que la transaction a été supprimée et qu'il faut la recréer manuellement (best-effort
côté client, faute de transaction SQL atomique côté serveur — celle-ci viendra dans une RPC dédiée).
Plus simple et plus robuste : ajouter une RPC `update_transaction_secure` côté SQL et l'appeler ici.
**Ajouté en SQL** dans le patch.

### B2. `loadAll()` ne charge pas `calendar_events` au démarrage
**Fichier :** `index.html` lignes 1586-1605
**Problème :** Le widget « Prochains événements » sur l'accueil (ligne 1914) lit `A.calEvents`,
qui reste vide tant que l'utilisateur n'a pas ouvert l'agenda. Conséquence : aucun événement
ne s'affiche sur la home tant qu'on n'est pas allé sur l'onglet Agenda. De plus, le calcul
d'équité utilise `A.calEvents` (`calHours`, ligne 2774) — le résultat est **faux** au démarrage
car les heures d'agenda ne sont pas comptées tant que l'agenda n'a pas été chargé.
**Correction :** appeler `loadCalEvents()` (mois courant) en parallèle dans `loadAll()`.

### B3. `delMeal` supprime sans confirmation
**Fichier :** `index.html` ligne 2597 (et HTML ligne 2570 — bouton ✕ collé au repas)
**Problème :** Tous les autres `del*` confirment, sauf `delMeal`. Un clic accidentel sur la
croix d'un repas l'efface définitivement. Risque de perte de données quotidienne.
**Correction :** ajouter un `confirm()` cohérent avec les autres suppressions.

### B4. RLS manquantes pour `transactions` (insert/update/delete)
**Fichier :** `SUPABASE_TOUT_EN_UN.sql` — seule la policy `tx_select` existe
**Problème :** Les transactions ne sont insérables/modifiables que via les RPC
`add_transaction_secure` et `delete_transaction_secure`. C'est un choix correct
côté client (toujours utilisé), MAIS si quelqu'un appelle directement `sb.from('transactions').insert(...)`
côté client (par erreur de dev futur), Postgres rejette **silencieusement** sans message clair.
Le DEV ressent ça comme un bug fantôme.
**Correction :** ajouter explicitement une policy `tx_block_direct_writes` qui REFUSE
toute écriture directe avec un message d'erreur explicite, OU expliciter dans le SQL le
choix de design. Choix retenu : ajouter un commentaire SQL explicite + une policy `false`
(refus total) — toute écriture passe obligatoirement par les fonctions `security definer`.

### B5. Ligne 2477-2478 : code mort sans assignation
**Fichier :** `index.html` lignes 2477-2478
**Problème :** Deux `document.querySelector(...)` enchaînés avec `||` mais le résultat n'est
ni assigné ni utilisé. Pollue le code, peut induire en erreur sur l'intention du dev.
**Correction :** suppression pure et simple.

### B6. `delAccount` supprime juste le profile (compte auth.users orphelin)
**Fichier :** `index.html` lignes 3312-3317
**Problème :** Sur suppression de compte, le profil est effacé (cascade vers couples/tasks/etc
via FK `on delete cascade`), mais l'entrée dans `auth.users` reste. RGPD : effacement
incomplet ; UX : impossible pour l'user de se réinscrire avec le même email.
**Correction côté client :** ne peut pas supprimer `auth.users` directement (réservé au
service-role). Ajout d'une RPC SQL `delete_my_account()` qui efface le profil ET marque
l'auth user pour suppression via `auth.admin.deleteUser` — ou plus simplement, on documente
le comportement et on ajoute un message clair à l'user.
**Choix retenu :** ajouter la RPC SQL côté serveur, l'appeler côté client. Si l'admin
Supabase n'a pas activé la fonctionnalité, fallback sur le comportement actuel + message.

### B7. `doSignOut` ne ferme pas le canal realtime AVANT de reset l'état
**Fichier :** `index.html` lignes 3286-3311
**Problème :** OK celui-ci est déjà géré (ligne 3289). Faux positif. À retirer de la liste.

### B8. `joinTask` / `leaveTask` définies mais jamais branchées
**Fichier :** `index.html` lignes 2968-2975 + `buildTC` ligne 2002
**Problème :** Le concept « j'aide sur cette tâche » existe (DB column `helper_id`, calcul
d'équité tient compte de `helper_id`) mais aucun bouton dans la UI ne permet de devenir
helper. Code mort qui suggère une feature non livrée.
**Correction :** brancher dans `buildTC` un bouton « 🤝 Aider » sur les tâches déjà
prises par le partenaire (et un bouton « Ne plus aider » si on est helper).

---

## 🟠 PRIORITÉ 2 — Logique métier / cohérence des données

### B9. `renderHome` : événements upcoming jamais affichés au démarrage
**Lié à B2.** Une fois B2 corrigé, ce point disparaît.

### B10. `calcEquity` calcule des heures d'agenda à partir d'events de la **semaine en cours uniquement**
**Fichier :** `index.html` lignes 2771-2779
**Problème :** Si `A.calEvents` ne contient pas la semaine courante (ex: l'user a navigué
vers un autre mois dans `loadCalEvents`), les heures ne sont pas comptées. `loadCalEvents`
remplace `A.calEvents` par les events du mois courant — donc si on navigue à mois -3,
les events de la semaine courante disparaissent du state.
**Correction :** `loadCalEvents` ne doit jamais écraser les events de la semaine courante.
Soit on charge un range fixe (3 mois autour de today), soit on **fusionne** les nouveaux
events au lieu de les remplacer.
**Choix retenu :** fusionner par id (`Map`) et charger en plus la semaine courante en
permanence depuis `loadAll()` (cf B2).

### B11. `detectSubscriptions` plante si une transaction a un `amount=0`
**Fichier :** `index.html` ligne 2346 — `Math.abs(a-avg)/avg`
**Problème :** Si `avg===0` (toutes les transactions à 0), division par zéro → `NaN<=0.05`
est `false` → groupe écarté (heureusement). Mais si une seule transaction a un montant
de 0 et les autres non, la division reste valide. Pas un bug bloquant mais valeur
limite à protéger.
**Correction :** garder seulement les transactions avec `amount>0` AVANT de grouper.

### B12. `addIngrToShop` n'évite pas les doublons cross-casse / cross-accents
**Fichier :** `index.html` ligne 2607
**Problème :** `existing.has(n.toLowerCase())` ignore juste la casse. « Pâtes » et « pates »
seraient considérés différents → doublon créé.
**Correction :** normaliser comme dans `_normTitle` (NFD + suppression des accents).

### B13. `renderEquity` affiche `pt.username[0]` même si pt est null
**Fichier :** `index.html` ligne 2862 — `buildEqPerson(p,...)`
**Problème :** Si on appelle `buildEqPerson(pt, ...)` avec `pt=null`, `p.username[0]` plante.
Vérifié : ligne 2847 fait déjà `pt?buildEqPerson(...):''` donc OK. Faux positif.

### B14. `confirmPartnerKeyChange` peut accéder à `A.partner.id` null
**Fichier :** `index.html` ligne 1467
**Problème :** Si `A.partner` est null au moment où l'user confirme, on accède à `.id` → erreur.
En pratique la fonction n'est appelable que si l'alerte de changement de clé existe, ce qui
ne peut arriver que si A.partner existait. Risque faible mais protégeable.
**Correction :** ajouter une garde `if(!A.partner)return;` au début.

---

## 🟡 PRIORITÉ 3 — Sécurité / bonnes pratiques

### B15. `_calColor` est utilisé dans `saveCalEvent` sans `sanitizeColor`
**Fichier :** `index.html` ligne 3483 (`color:_calColor`)
**Problème :** `_calColor` est settée par `selectCalColor` qui passe par `sanitizeColor`
(ligne 3456) — c'est OK. Mais `_calColor` reste à la valeur précédente si on n'ouvre pas
le modal correctement. La DB a une contrainte `color ~ '^#[0-9A-Fa-f]{6}$'` donc une mauvaise
valeur serait rejetée par Postgres. Pas un bug mais à passer en sanitize systématiquement
par robustesse.
**Correction :** `color: sanitizeColor(_calColor)` pour cohérence avec le reste du code.

### B16. Service Worker : pas de fichier `sw.js` fourni dans le package
**Fichier :** `index.html` ligne 3364 — `navigator.serviceWorker.register('/sw.js')`
**Problème :** Le brief mentionne `sw.js` dans les fichiers inchangés mais il n'a pas
été fourni dans cet upload. À déployer, sinon le SW silencieusement absent.
**Correction :** fournir un `sw.js` minimal cache-first qui gère l'offline pour la coquille
HTML + une page `/offline.html` simple.

### B17. `editAccount` ne sanitize pas la couleur saisie
**Fichier :** `index.html` lignes 2474-2475
**Problème :** L'input `ac-co` est un `<select>` avec valeurs hardcodées (mo-ac), donc en
pratique on ne peut pas injecter une couleur arbitraire. Mais si quelqu'un manipule le DOM,
la valeur passe directement à `sb.from('accounts').update({color:...})`. La DB n'a pas de
contrainte sur `accounts.color`. Ajouter `sanitizeColor` côté client par sécurité.
**Correction :** wrap `color` dans `sanitizeColor(color)` avant l'update.

### B18. `localStorage.setItem('ll-last-ua-...')` peut grossir indéfiniment
**Fichier :** `index.html` lignes 1326-1333
**Problème :** Une entrée par UID. Pas de nettoyage. Sur un appareil partagé entre plusieurs
comptes, accumulation lente. Faible impact mais à mentionner.
**Correction :** non corrigée (effort > gain). À documenter.

---

## 🟢 PRIORITÉ 4 — UX & polish

### B19. Manifest : `start_url` ne respecte pas le query `?tab=...`
**Fichier :** `manifest.json` ligne 5 — `"start_url": "/"`
**Problème :** Les `shortcuts` envoient sur `/?tab=tasks` par exemple, OK. Mais si le SW
intercepte et redirige vers `/`, le query est perdu. Le code (l. 3354) gère ce cas via
`URLSearchParams` donc c'est cohérent. Pas un bug.

### B20. Le bouton FAB est caché sur calendar (pas dans la liste de pages où FAB est caché)
**Fichier :** `index.html` ligne 1807
**Problème :** `home, chat, equity, settings` cachent le FAB. Sur `calendar`, le FAB est
visible et `quickAdd` (l. 1819) ouvre `openCalModal()`. Donc OK. Faux positif.

### B21. Bouton « Modifier » sur les tâches : pas de label texte (juste ✏️)
**Accessibilité :** lecteur d'écran lit « emoji crayon emoji », non explicite.
**Correction :** ajouter `aria-label="Modifier la tâche"` et `aria-label="Supprimer la tâche"`
sur les boutons `.tc-a` ligne 2027.

### B22. Footer indique « v4.1 » alors qu'on va passer à v4.2
**Fichier :** `index.html` ligne 3200
**Correction :** bumper à `v4.2`.

### B23. Sparkline historique d'équité : couleur partenaire fallback `#999` si pt null
**Fichier :** `index.html` ligne 2901 — `sanitizeColor(pt?.avatar_color)||'#999'`
**Problème :** `sanitizeColor(undefined)` retourne `'var(--p1)'` (fallback), donc le `||'#999'`
n'est jamais déclenché. Mais c'est un détail mineur, le fallback `#999` ne sera pas atteint.
Pas un bug.

---

## 🟢 BONUS — Améliorations livrées avec ce patch

- Ajout d'un bouton « 🤝 Aider » sur les tâches prises par le partenaire (B8).
- Les heures d'agenda sont maintenant chargées dès le démarrage → équité juste dès la 1re visite (B2/B10).
- Confirmation avant suppression de repas (B3).
- Rollback explicite si édition de transaction échoue (B1).
- RPC SQL `update_transaction_secure` ajoutée → édition atomique côté serveur.
- RPC SQL `delete_my_account` ajoutée pour effacement RGPD complet (B6).
- Policies SQL explicites sur `transactions` (refus écriture directe) (B4).
- Sanitize systématique des couleurs dans tous les writes vers la DB (B15/B17).
- `addIngrToShop` normalise les noms (NFD, accents) (B12).

---

## ⚠️ Limites connues / non corrigées dans cette PR

- L'historique d'équité reste en `localStorage` côté client (limite déjà documentée v4.1).
  Migration vers Supabase = scope d'une PR future.
- Le SW est livré minimal (cache shell + offline). Pas de Workbox ni de stratégies
  avancées — délibéré, pour rester monolithique et simple.
- Pas de tests automatisés ajoutés (cf. brief : conserver la simplicité).
- Pas de mode sombre (cf. brief : non prioritaire).
