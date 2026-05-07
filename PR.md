# 🛠️ fix: audit complet v4.2 — stabilité, intégrité données, équité, PWA offline

## ✅ Résumé des changements

Audit complet de l'app monolithique post-v4.1. Couverture des 4 priorités du brief :
crashs/bugs bloquants → logique métier → sécurité → UX/polish.

**Fichiers modifiés :** `index.html`, `SUPABASE_TOUT_EN_UN.sql`
**Fichiers ajoutés :** `sw.js`, `offline.html`, `_headers`, `_redirects`, `DEPLOY.md`, `AUDIT.md`
**Compatibilité :** rétro-compatible avec v4.1. Le frontend dégrade gracieusement si le SQL
n'est pas mis à jour en premier, et inversement. Idéalement appliquer SQL avant frontend.

---

## 🐛 Bugs corrigés (par ordre de priorité)

### Priorité 1 — Crash & bugs bloquants
- **Édition de transaction non atomique** → en cas d'échec de la recréation après suppression,
  l'opération était définitivement perdue. Nouvelle RPC SQL `update_transaction_secure` +
  fallback côté client avec restauration de l'original si tentative 2 échoue.
- **`loadAll()` ne chargeait pas les événements du calendrier** → widget « Prochains
  événements » sur l'accueil toujours vide, et calcul d'équité faux (les heures d'agenda
  n'étaient pas comptées) tant qu'on n'avait pas ouvert l'agenda. Chargement parallèle
  ajouté.
- **Suppression de repas sans confirmation** → un clic accidentel sur ✕ effaçait
  définitivement le repas. `confirm()` ajouté + toast.

### Priorité 2 — Logique métier / cohérence
- **`loadCalEvents` écrasait le state** → naviguer vers un autre mois faisait disparaître
  les events de la semaine courante du calcul d'équité. Fusion par id maintenant.
- **`detectSubscriptions` division par zéro possible** sur transactions à montant 0.
  Filtrage en amont.
- **`addIngrToShop` créait des doublons** « Pâtes » / « pates ». Normalisation NFD.
- **Bouton « 🤝 Aider » jamais branché** → la column `helper_id` existait dans la DB et
  était comptée dans `calcEquity` mais aucun bouton dans la UI ne permettait de l'utiliser.
  Branché dans `buildTC`.
- **Garde nulle manquante** dans `confirmPartnerKeyChange`.

### Priorité 3 — Sécurité / bonnes pratiques
- **RLS `transactions` incohérente** → seule `tx_select` existait. Une écriture directe
  était silencieusement rejetée par PG. Ajout de policies explicites `tx_block_direct_*`
  qui rendent le design intentionnel et évitent les bugs fantômes en debug.
- **Suppression de compte incomplète (RGPD)** → `delAccount` supprimait juste le profil,
  laissant le compte `auth.users` orphelin. Nouvelle RPC `delete_my_account` côté SQL,
  appel côté client avec fallback graceful.
- **`sanitizeColor` manquant** sur `saveCalEvent` et `saveAccount`. Maintenant systématique.
- **Code mort** dans `editAccount` (querySelector sans assignation) supprimé.

### Priorité 4 — UX / polish / a11y
- `aria-label` ajoutés sur les boutons icône (✏️, 🗑️, ✓ checkbox de tâche).
- Tag visuel « 🤝 partenaire aide » sur les tâches helper.
- Toast de confirmation après suppression repas.
- Footer : `v4.1` → `v4.2`.

---

## 🔧 Améliorations techniques

### Backend (Supabase / PostgreSQL)
- ✨ Nouvelle RPC `update_transaction_secure(...)` — édition de transaction atomique
  qui ajuste correctement le solde dans tous les cas (même compte ou changement de compte).
- ✨ Nouvelle RPC `delete_my_account()` — effacement RGPD complet (profil + cascade).
  Le couple est aussi supprimé si l'utilisateur était seul.
- 🔒 Policies `tx_block_direct_insert/update/delete` — refus explicite des writes directs
  sur `transactions` (toute écriture passe par les RPC `*_secure`).
- 🧹 `drop policy if exists` mis à jour pour rendre le SQL ré-exécutable.

### Frontend
- 🚀 Service Worker (`sw.js`) avec stratégies différenciées :
  - cache-first pour la coquille (HTML, manifest, icônes)
  - network-first pour Supabase (jamais cachées)
  - cache-first + revalidation pour les CDN externes
  - fallback `offline.html` quand pas de cache et pas de réseau
- 📡 Page `offline.html` autonome (zéro dépendance externe), reload auto au retour réseau.
- 🛡️ `_headers` Netlify : SW jamais caché, headers de sécurité (X-Frame-Options, nosniff…).
- 🛣️ `_redirects` Netlify : SPA fallback + accès direct préservé pour assets PWA.

---

## ⚠️ Points sensibles / risques restants

1. **Suppression effective `auth.users`** — la RPC `delete_my_account` supprime le profil
   et toutes les données utilisateur (cascade), mais ne peut pas supprimer la ligne
   `auth.users` (réservé au service-role). Mitigations possibles :
   - Cron côté admin Supabase qui supprime les `auth.users` orphelins (sans profile correspondant).
   - Edge function avec service-role qui fait le ménage.
   - Acceptation du comportement actuel (l'user voit un message clair).

2. **Historique d'équité en localStorage** — limite déjà documentée v4.1, non touchée
   ici (scope d'une PR future). Plafonné à 60 jours pour éviter saturation.

3. **Apostrophes dans onclick** — toutes vérifiées par script (0 occurrence buggée).
   Reste à appliquer la même rigueur sur tout futur `onclick` ajouté. Pour les futurs
   contributeurs : utiliser `\\''+var+'\\''` (jamais `''+var+''`).

4. **Test manuel obligatoire** — pas de tests automatisés (cohérent avec l'esprit
   "monolithique simple" du projet). Voir checklist post-déploiement dans `DEPLOY.md`.

5. **Le SW s'active après reload complet** — au premier déploiement, les utilisateurs
   existants ne profiteront du SW qu'après une fermeture/réouverture de l'app. Toast
   informatif déjà implémenté ligne 3370 de `index.html`.

---

## 🧪 Tests / vérification

### Validation statique (déjà passée)
- ✅ Parsing JS du bloc `<script>` complet — `new Function(code)` passe sans erreur.
- ✅ 61 handlers `onclick` référencés, 0 fonction manquante.
- ✅ 0 occurrence d'apostrophes mal échappées détectée.
- ✅ SQL ré-exécutable (drop policies + create or replace functions).

### Tests manuels post-déploiement
Voir `DEPLOY.md` section 3️⃣ pour la checklist complète. Cas à valider en priorité :

1. **Édition de transaction**
   - Créer une dépense → modifier le montant → vérifier que le solde du compte est juste.
   - Modifier la transaction en changeant de compte → vérifier que les deux soldes sont justes.
   - (Cas limite) couper le réseau pendant l'édition → vérifier qu'on récupère un message
     clair sans perte de données.

2. **Accueil → événements upcoming**
   - Créer un événement dans le futur via l'agenda.
   - Recharger l'app → l'accueil doit afficher le widget « Prochains événements »
     **sans qu'on ait besoin d'ouvrir l'agenda**.

3. **Équité**
   - Créer plusieurs événements cette semaine.
   - Première ouverture : la page Équité doit afficher les heures d'agenda dans le détail.

4. **Bouton « 🤝 Aider »**
   - Compte A : créer une tâche partagée, la prendre.
   - Compte B (partenaire) : sur cette tâche, voir le bouton « 🤝 Aider ».
   - Cliquer → bouton change en « 🤝 J'aide · annuler ».
   - Compte A : voit le tag « 🤝 partenaire aide » sur sa tâche.

5. **Service Worker**
   - DevTools → Application → Service Workers → vérifier `activated`.
   - Network → Offline → reload → l'app reste utilisable depuis le cache.

---

## 📋 Commits suggérés (atomiques)

Pour appliquer ces changements en commits propres et atomiques, voir `COMMITS.md`.
Chaque commit est indépendant et peut être révisé séparément.

---

## 🚀 Déploiement

Voir `DEPLOY.md` pour la procédure complète. **Ordre obligatoire** :
1. Supabase SQL (nouvelles RPC + policies)
2. Netlify (frontend + sw.js + offline.html + _headers/_redirects)

Les deux côtés sont rétro-compatibles, mais l'ordre minimise les chemins de fallback.
