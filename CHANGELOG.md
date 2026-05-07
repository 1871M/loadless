# LoadLess — Changelog

## v4.2 (audit complet, 2026-05-07)

Branche : `fix/audit-app-stability`
Fichiers modifiés : `index.html`, `SUPABASE_TOUT_EN_UN.sql`
Fichiers ajoutés : `sw.js`, `offline.html`, `AUDIT.md`

### 🔴 Bugs critiques corrigés

#### 1. Édition de transaction non atomique → perte de données possible
**Avant :** En mode édition, on supprimait puis recréait la transaction. Si la recréation
échouait (réseau coupé, RLS bloque, compte supprimé), la transaction originale était
**perdue sans aucun rollback**.
**Après :**
- Nouvelle RPC SQL `update_transaction_secure(...)` qui ajuste le solde et met à jour
  la transaction en une seule transaction PostgreSQL.
- Côté client, `saveTx` essaie d'abord la RPC. Si elle n'existe pas encore (404), fallback
  sur la séquence delete+add **avec restauration** de l'original si l'add échoue.
- Plus aucun chemin n'aboutit à une transaction perdue silencieusement.

#### 2. Calendrier non chargé au démarrage
**Avant :** `loadAll()` chargeait tasks/shop/accounts/transactions/messages/meals mais **pas
les événements du calendrier**. Conséquences :
- Le widget « Prochains événements » sur l'accueil était toujours vide tant que l'utilisateur
  n'avait pas ouvert l'agenda manuellement.
- Le calcul d'équité (`calcEquity`) ne comptait pas les heures d'agenda → équité fausse
  jusqu'à la première visite de l'onglet Agenda.
**Après :** chargement des événements du mois courant + suivant en parallèle dans `loadAll()`.

#### 3. `loadCalEvents` écrasait les événements en mémoire
**Avant :** Naviguer vers un autre mois remplaçait `A.calEvents`, faisant disparaître les
événements de la semaine courante du calcul d'équité.
**Après :** fusion par id (`Map`) — on garde tout ce qui a été chargé.

#### 4. Suppression de repas sans confirmation
**Avant :** Un clic accidentel sur la croix d'un repas l'effaçait définitivement, contrairement
à toutes les autres suppressions (tâches, transactions, événements...).
**Après :** `confirm()` cohérent avec le reste de l'app + toast de confirmation.

#### 5. RLS `transactions` : incohérence silencieuse possible
**Avant :** Seule la policy `tx_select` existait. Une écriture directe via `sb.from('transactions').insert()`
était silencieusement rejetée par PostgreSQL — debug confus pour les futurs devs.
**Après :** policies explicites `tx_block_direct_insert/update/delete` qui rendent le design
intentionnel évident : toute écriture passe par les RPC `*_secure`.

#### 6. Suppression de compte incomplète (RGPD)
**Avant :** `delAccount` supprimait juste la ligne `profiles`. Le compte `auth.users` restait,
donc impossible pour l'utilisateur de se réinscrire avec le même email.
**Après :**
- Nouvelle RPC SQL `delete_my_account()` qui supprime le profil (cascade → toutes les données),
  log l'action et prépare le compte auth pour nettoyage.
- Le canal realtime est fermé proprement avant la suppression.
- Fallback graceful si la RPC n'est pas encore déployée.
- Note : la suppression effective dans `auth.users` nécessite un cron côté admin Supabase
  (limite technique du SDK client).

### 🟠 Améliorations métier / cohérence

#### 7. Bouton « 🤝 Aider » sur les tâches du partenaire
La colonne `helper_id` existait dans la DB et était comptée dans `calcEquity`, mais aucun
bouton ne permettait de l'utiliser. Maintenant : sur chaque tâche prise par le partenaire,
un bouton « 🤝 Aider » apparaît. Quand on aide, on bascule vers « 🤝 J'aide · annuler ».
Un tag visuel indique au partenaire que quelqu'un l'aide.

#### 8. Détection d'abonnements robuste aux montants nuls
Les transactions à montant 0 sont maintenant exclues de la détection (évite division par zéro
dans le calcul de la tolérance ±5%).

#### 9. Ajout d'ingrédients aux courses : déduplication intelligente
Avant : « Pâtes » et « pates » étaient considérés différents → doublon. Maintenant : normalisation
NFD (suppression des accents) + casse pour comparer.

### 🟡 Sécurité / robustesse

#### 10. `sanitizeColor` systématique sur tous les writes vers la DB
- `saveCalEvent` : sanitize + fallback hex valide
- `saveAccount` : sanitize sur insert et update
Évite toute injection CSS via les champs couleur même si quelqu'un manipule le DOM.

#### 11. Garde nulle dans `confirmPartnerKeyChange`
Protection si `A.partner` ou `A.user` est null au moment où l'utilisateur confirme la clé.

#### 12. Code mort supprimé
`editAccount` contenait un `querySelector` inutile (lookup sans assignation, ligne 2477).

### 🟢 PWA / offline

#### 13. Service Worker fourni (`sw.js`)
- Cache-first pour la coquille (HTML, manifest, icônes)
- Network-first pour les requêtes Supabase (jamais cachées)
- Cache-first avec mise à jour en arrière-plan pour les CDN externes (jsdelivr)
- Fallback sur `/offline.html` quand pas de réseau et pas de cache

#### 14. Page `offline.html`
Page minimale autonome (pas de dépendances externes), avec rechargement auto dès retour réseau.

### ♿ Accessibilité

#### 15. Boutons d'icône avec `aria-label` explicite
Les boutons ✏️ et 🗑️ sur les tâches avaient juste l'emoji. Ajout de `aria-label="Modifier la tâche"`
et `aria-label="Supprimer la tâche"` pour les lecteurs d'écran. Idem sur la checkbox de tâche
avec `role="button"` et label dynamique selon l'état.

### 📐 Versioning
Footer `LoadLess v4.1` → `LoadLess v4.2`.

---

## ⚠️ Limites connues / non corrigées (volontairement)

| Sujet | Raison |
|---|---|
| Historique d'équité en `localStorage` | Migration vers Supabase = scope d'une PR future, pas bloquant |
| Pas de tests automatisés | Cohérent avec le brief "rester monolithique" |
| Mode sombre | Non prioritaire selon le brief initial |
| Suppression effective `auth.users` | Limite technique du SDK client — nécessite cron admin |
| Internationalisation | Non demandée |

---

## 🚀 Déploiement

Voir `DEPLOY.md` pour la procédure complète Netlify + Supabase.

---

## 📜 Historique

### v4.1 (précédente)
Voir `CHANGELOG-v4.1.md`.
