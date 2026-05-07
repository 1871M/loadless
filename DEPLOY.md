# LoadLess — Guide de déploiement v4.2

Procédure pas à pas pour mettre en production. Suivez dans l'ordre.

---

## 1️⃣ Supabase (backend) — à faire en PREMIER

> ⚠️ Faire le SQL avant le push frontend, sinon les nouvelles RPC seront introuvables et
> les nouvelles fonctionnalités (édition tx atomique, suppression compte complète) tomberont
> en mode fallback dégradé.

### Étape 1 — SQL
1. Ouvrir le projet Supabase → **SQL Editor** → **New query**.
2. Coller **TOUT** le contenu de `SUPABASE_TOUT_EN_UN.sql`.
3. Cliquer **Run** (▶️).
4. Vérifier : pas d'erreur dans la console.

### Étape 2 — Vérifications
Dans **Database** → **Functions**, vérifier la présence de :
- ✅ `add_transaction_secure`
- ✅ `update_transaction_secure` ⭐ **NOUVEAU**
- ✅ `delete_transaction_secure`
- ✅ `delete_my_account` ⭐ **NOUVEAU**
- ✅ `create_couple_secure`
- ✅ `join_couple`
- ✅ `rotate_invite_code`
- ✅ `get_messages_page`, `get_transactions_page`
- ✅ `is_couple_member`
- ✅ `cleanup_rate_limits`, `cleanup_security_logs`, `delete_expired_messages`

Dans **Database** → **Policies** → table `transactions`, vérifier :
- ✅ `tx_select`
- ✅ `tx_block_direct_insert` ⭐ **NOUVEAU**
- ✅ `tx_block_direct_update` ⭐ **NOUVEAU**
- ✅ `tx_block_direct_delete` ⭐ **NOUVEAU**

### Étape 3 — Realtime
Dans **Database** → **Replication**, vérifier que les tables suivantes ont la réplication
activée (devrait être fait automatiquement par le SQL) :
tasks, shopping_items, messages, meals, accounts, transactions, calendar_events.

### Étape 4 (optionnel) — Cron pour nettoyage auth.users orphelins
Si vous voulez un effacement RGPD complet, créer un cron côté admin (pg_cron ou edge function)
qui supprime les `auth.users` dont l'`id` n'a pas de ligne dans `profiles` depuis plus de 24h.
Sans ça, les comptes auth.users restent (pas un bug bloquant — l'utilisateur reçoit le message
"sera nettoyé sous 24h").

---

## 2️⃣ Netlify (frontend)

### Fichiers à publier (à la racine du site)
```
index.html                  ← l'app entière
manifest.json
sw.js                       ← NOUVEAU (service worker)
offline.html                ← NOUVEAU (fallback offline)
_headers                    ← NOUVEAU (config cache + sécurité Netlify)
_redirects                  ← NOUVEAU (SPA routing)
icons/
  ├── icon-72.png
  ├── icon-96.png
  ├── icon-128.png
  ├── icon-144.png
  ├── icon-152.png
  ├── icon-192.png
  ├── icon-384.png
  └── icon-512.png
```

### Méthode A — Drag & drop (le plus simple)
1. Aller sur https://app.netlify.com/drop
2. Glisser-déposer le dossier complet contenant tous les fichiers ci-dessus.
3. Netlify détecte automatiquement `_headers` et `_redirects`.
4. Le site est en ligne en 30 secondes.

### Méthode B — CLI ou Git
```bash
# Dans le dossier du projet
netlify deploy --prod --dir=.
```

### Étape 3 — Vérifier le déploiement
Une fois le site en ligne :
1. Ouvrir l'app dans Chrome → DevTools (F12).
2. Onglet **Application** → **Service Workers** → vérifier que `sw.js` est `activated and running`.
3. Onglet **Network** → cocher "Offline" → recharger → la coquille HTML s'affiche depuis le cache.
4. Onglet **Application** → **Manifest** → vérifier que les icônes et shortcuts s'affichent.
5. Vérifier le score Lighthouse PWA (devrait être > 90).

---

## 3️⃣ Tests post-déploiement (checklist)

Connectez-vous depuis un mobile et vérifier :

### Onboarding
- [ ] Inscription (email + pseudo + mot de passe)
- [ ] Confirmation email reçue
- [ ] Connexion
- [ ] Création d'un foyer ou rejointe via code

### Tâches
- [ ] Ajout via FAB (+)
- [ ] Modification (✏️)
- [ ] Suppression (🗑️ avec confirmation)
- [ ] Bouton « Je m'en charge »
- [ ] Bouton « 🤝 Aider » sur une tâche prise par le partenaire ⭐ **NOUVEAU**
- [ ] Validation (clic sur la checkbox)

### Agenda
- [ ] L'onglet Agenda est visible dans la nav
- [ ] Ajout d'événement (avec heure début/fin)
- [ ] Modification d'événement
- [ ] Suppression d'événement (avec confirmation)
- [ ] Navigation mois précédent/suivant
- [ ] **Le widget « Prochains événements » sur l'accueil s'affiche IMMÉDIATEMENT** (pas
      besoin d'ouvrir l'agenda d'abord) ⭐ **NOUVEAU**

### Budget
- [ ] Ajout dépense / revenu / abonnement / retrait
- [ ] **Modification d'une transaction** (clic sur ✏️) ⭐ **CORRIGÉ**
- [ ] **Suppression d'une transaction** (clic sur 🗑️) ⭐ **CORRIGÉ**
- [ ] Le solde du compte se met à jour correctement
- [ ] Détection d'abonnements (panneau dépliable)

### Courses
- [ ] FAB ouvre le modal d'ajout
- [ ] Ajout rapide via la barre Entrée
- [ ] Modification d'un article
- [ ] Suppression
- [ ] Effacer les articles cochés

### Repas
- [ ] Planifier un repas (matin/midi/soir)
- [ ] Modifier un repas
- [ ] **Supprimer un repas demande confirmation** ⭐ **CORRIGÉ**
- [ ] « Ajouter ingrédients aux courses » → pas de doublons accents/casse ⭐ **CORRIGÉ**

### Équité
- [ ] **L'équité s'affiche correctement dès la première ouverture** (avec heures d'agenda) ⭐ **CORRIGÉ**
- [ ] Modifier la disponibilité
- [ ] Voir l'historique (sparkline)

### Chat
- [ ] Envoi de message chiffré
- [ ] Réception en temps réel sur l'autre appareil
- [ ] Vérification du fingerprint (clé)
- [ ] Auto-suppression (sélection durée)

### Profil
- [ ] Modifier pseudo + couleur
- [ ] Préférences (vibrations, animations, contraste, texte agrandi)
- [ ] Régénérer code d'invitation (si créateur du foyer)
- [ ] Régénérer ma clé E2E
- [ ] Déconnexion
- [ ] **Suppression de compte** (RPC `delete_my_account`) ⭐ **CORRIGÉ**

### PWA / offline
- [ ] Installation sur l'écran d'accueil (mobile)
- [ ] Raccourcis PWA (long-press sur l'icône) → Tâches/Agenda/Budget/Courses
- [ ] Mode avion : la coquille reste accessible, page offline en fallback
- [ ] Retour réseau : reprise de la sync

---

## 4️⃣ Rollback en cas de problème

### Frontend
Netlify garde l'historique des déploiements. Aller dans **Deploys** → cliquer sur l'ancien
déploiement → **Publish deploy**.

### Backend
Le SQL v4.2 est rétro-compatible avec v4.1 :
- Les nouvelles RPC sont ajoutées (pas de remplacement de l'existant).
- Les nouvelles policies `tx_block_direct_*` peuvent être droppées si besoin.

Pour rollback côté SQL :
```sql
drop function if exists update_transaction_secure(uuid, uuid, text, numeric, text, text, text, date);
drop function if exists delete_my_account();
drop policy if exists "tx_block_direct_insert" on transactions;
drop policy if exists "tx_block_direct_update" on transactions;
drop policy if exists "tx_block_direct_delete" on transactions;
```

---

## 5️⃣ Monitoring après déploiement

### Côté Supabase
- **Database** → **Logs** : surveiller les erreurs de requêtes.
- **Reports** → **API** : vérifier le volume d'appels aux RPC.
- Table `security_logs` : actions sensibles tracées (création couple, ajout tx, suppression...).

### Côté client
Le logger interne (`LL.log`) garde les 200 derniers events en mémoire. En cas de bug
utilisateur, on peut récupérer via la console : `LL.exportLogs()`.
