# AUDIT SÉCURITÉ APPLICATION — Loadless v4.6.1
**Branch:** `feat/major-refactor-v2`  
**Date:** 2026-05-12  
**Scope:** Auth, RLS, stockage tokens, HTTPS/CSP, validation inputs, XSS/injection, permissions Android, logs

---

## Légende
| Symbole | Gravité |
|---------|---------|
| ✅ | Sécurisé |
| ℹ️ | Informatif / non critique |
| ⚠️ | Risque modéré — à corriger |
| 🔴 | Risque élevé — correction prioritaire |

---

## 1. Authentification

| Élément | Statut | Détail |
|---------|--------|--------|
| JWT Supabase | ✅ | Tokens signés côté Supabase, vérifiés à chaque RLS eval |
| Email non confirmé | ⚠️ | Code: `if(data.user?.identities?.length===0)` → toast warn mais accès accordé. Un utilisateur avec email non confirmé peut utiliser l'app. |
| Rate limiting invite_code | ✅ | 4 tentatives/UID (15 min), 6 tentatives/email (30 min) via `rate_limits` table |
| Security logs | ✅ | `security_logs` trace: login, join_couple, transactions, delete_account |
| Auto-lock inactivité | ✅ | 5 min → `sb.auth.signOut()` sur `['mousemove','keydown','touchstart','click','scroll']` |
| Nouveau device | ✅ | Détection via `LL.log('warn','security','new_device_detected')` |
| Session refresh | ✅ | Géré par Supabase JS SDK (refresh token auto) |

**Risque email non confirmé :** Un attaquant qui contrôle une adresse email non confirmée peut créer un compte et utiliser l'app. Dans un contexte couple/données privées, préférer bloquer jusqu'à confirmation.

**Remédiation :**
```js
// Dans handleAuth() après login
if(data.user?.identities?.length===0 || !data.user?.email_confirmed_at){
  await sb.auth.signOut();
  toast('Confirmez votre email avant de continuer.','error',8000);
  return;
}
```

---

## 2. Row Level Security (RLS)

| Table | Select | Insert | Update | Delete | Statut |
|-------|--------|--------|--------|--------|--------|
| profiles | Soi + partenaire | Soi uniquement | Soi uniquement | Soi uniquement | ✅ |
| couples | Membres uniquement | partner1 uniquement | Les deux membres | partner1 uniquement | ✅ |
| tasks | Couple member (+ personal_owner si perso) | Couple member | Couple member | Couple member | ✅ |
| shopping_items | Couple member | Couple member + added_by=uid | Couple member | Couple member | ✅ |
| accounts | Couple member | Couple member | Couple member | Couple member | ✅ |
| transactions | Couple member | **Bloqué** (false) | **Bloqué** (false) | **Bloqué** (false) | ✅ |
| meals | Couple member | Couple member + created_by=uid | Couple member | Couple member | ✅ |
| messages | Couple member | Couple member + sender_id=uid + len checks | — | Couple member | ✅ |
| calendar_events | Couple member | Couple member + created_by=uid | Couple member | Couple member | ✅ |
| security_logs | user_id=uid uniquement | — (RPC definer) | — | — | ✅ |
| rate_limits | RLS enabled, **aucune policy** → tout bloqué | — (RPC definer) | — | — | ✅ |

**Points forts :**
- `is_couple_member()` helper : `SECURITY DEFINER`, `set search_path = public, auth` — pas de SQL injection via search_path.
- Transactions bloquées côté client → forcent passage par RPCs `add/update/delete_transaction_secure` qui gèrent le solde atomiquement.
- Trigger `trg_prevent_balance_update` : balance modifiable uniquement si `app.bypass_balance_check = 'true'` (set dans RPCs uniquement).
- Trigger `trg_profile_couple_integrity` : vérifie l'intégrité couple_id ↔ profil avant update.

**Point à vérifier :**
- `rotate_invite_code` : restreint à `partner1_id` uniquement. Le partner2 reçoit une erreur `unauthorized` — code JS gère avec `if(A.partner){toast(...);return;}`. ✅

---

## 3. Stockage Tokens / Clés

| Élément | Stockage | Statut | Détail |
|---------|----------|--------|--------|
| JWT Supabase (access_token) | localStorage (SDK) | ⚠️ | Standard Supabase JS SDK — accessible via JS. Acceptable dans Capacitor (WebView isolée). |
| Clé privée ECDH | IndexedDB (`ll-k`, version 2) | ✅ | Meilleure isolation que localStorage |
| Timestamp rotation | localStorage (`ll-key-rotation-{uid}`) | ✅ | Non-sensible — juste un timestamp |
| Préférences | localStorage (`ll-prefs`) | ✅ | Non-sensibles (darkMode, lang, haptics, ephDur) |
| Session vue messages | localStorage (`ll-seen-{coupleId}-{uid}`) | ✅ | Non-sensible |
| `E2E.encryptLocal()` | — | ⚠️ | Dérive une clé avec `uid + 'll-local-2026'` comme password PBKDF2. Secret codé en dur dans le JS source → toute personne lisant le code peut dériver la clé. Fournit une illusion de protection, pas une réelle sécurité. |

**Remédiation `encryptLocal` :** Si besoin de chiffrement local, dériver depuis un secret que seul l'utilisateur connaît (ex: hash du mot de passe) plutôt qu'une constante codée. En pratique, cette fonction n'est pas appelée dans le code visible — à supprimer si inutilisée.

---

## 4. Transport / HTTPS / CSP

### CSP actuelle :
```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
connect-src 'self' https://lalpmkyxzapiheadvckp.supabase.co wss://lalpmkyxzapiheadvckp.supabase.co https://*.r2.cloudflarestorage.com;
img-src 'self' data: blob:;
media-src blob:;
font-src 'self' https://fonts.gstatic.com;
worker-src 'self';
manifest-src 'self';
object-src 'none';
base-uri 'self';
```

| Directive | Statut | Détail |
|-----------|--------|--------|
| `script-src 'unsafe-inline'` | ⚠️ | Requis (app single-file avec JS inline). Empêche CSP de protéger contre XSS. Inévitable avec l'architecture actuelle. |
| `connect-src` R2 ajouté | ✅ | Phase 4 — `https://*.r2.cloudflarestorage.com` |
| `media-src blob:` | ✅ | Phase 4 — lecture media locale |
| `object-src 'none'` | ✅ | Bloque `<object>`, `<embed>`, Flash |
| `base-uri 'self'` | ✅ | Prévient injection base URL |
| `frame-ancestors` absent | ⚠️ | Pas de protection clickjacking dans CSP. Mitigé partiellement par Capacitor (pas de navigateur standard). |
| HTTPS Supabase | ✅ | Toutes les requêtes Supabase en TLS 1.2+ |
| HTTPS R2 presigned | ✅ | `https://` dans les URLs presigned |
| `integrity` supabase.min.js | ✅ | SHA-256 vérifié sur le chargement |
| `integrity` qrcode.min.js | ✅ | SHA-256 vérifié |

**Remédiation clickjacking :**
```html
<meta http-equiv="Content-Security-Policy" content="... ; frame-ancestors 'none';">
```

---

## 5. Validation des Inputs / Protection XSS

| Vecteur | Statut | Détail |
|---------|--------|--------|
| `esc(s)` appliqué | ✅ | Encode `&`, `<`, `>`, `"` — utilisé sur tous les strings user-provided dans innerHTML |
| `sanitizeColor(c)` | ✅ | Regex `^#[0-9A-Fa-f]{6}$` — bloque injection CSS via couleur avatar |
| Contraintes DB (CHECK) | ✅ | username ≥ 2, display_name ≥ 1, title ≥ 1, amount > 0, type IN (...), ciphertext/iv length |
| `avatar_url` base64 | ⚠️ | Photo profil stockée en base64 directement dans `profiles.avatar_url`. Pas de limite de taille enforced côté client avant compression. Une image non-compressable pourrait générer une colonne > 1 MB. Supabase impose 1 MB par row par défaut. |
| Backup import (`importBackup`) | ⚠️ | Validation minimale de structure, mais upsert les données sans vérifier les types des champs. Impact limité (affecte seulement les données du couple de l'utilisateur connecté). |
| SQL injection | ✅ | Supabase PostgREST + paramétrage automatique des queries. Pas de concatenation SQL côté client. |
| Injection media_name | ✅ | `media_name` passé via `_msgMeta` Map (pas inline HTML) — pas d'injection via nom de fichier |
| invite_code input | ✅ | `upper(trim(...))` dans RPC join_couple — normalisé côté DB |

---

## 6. Permissions Android

| Permission | Statut | Usage |
|------------|--------|-------|
| INTERNET | ✅ | Requis — Supabase, R2 |
| CAMERA | ⚠️ | Déclarée dans AndroidManifest pour photo profil. Vérifier que `Capacitor.Plugins.Camera` demande la permission au runtime avant usage. |
| RECORD_AUDIO | ⚠️ | Pour messages vocaux. Demande de permission à vérifier au runtime. |
| READ_EXTERNAL_STORAGE / READ_MEDIA_* | ⚠️ | Nécessaire pour sélectionner images/vidéos/fichiers. Android 13+ : READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_MEDIA_AUDIO séparés. À vérifier dans AndroidManifest. |
| WRITE_EXTERNAL_STORAGE | ℹ️ | Non nécessaire pour l'export (blob download en WebView). |
| POST_NOTIFICATIONS | 🔜 | Phase 5 (OneSignal) |
| `FLAG_SECURE` | ⚠️ | Non configuré dans Capacitor → captures d'écran possibles dans le chat. Recommandé pour l'écran chat. |

**Remédiation FLAG_SECURE pour chat :**
```java
// Dans MainActivity.java ou via plugin Capacitor
getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,
                     WindowManager.LayoutParams.FLAG_SECURE);
```
Ou via `capacitor.config.json` si le plugin Screen Security est disponible.

---

## 7. Gestion des Logs / Audit Trail

| Élément | Statut | Détail |
|---------|--------|--------|
| `LL.logger` redaction | ✅ | SENSITIVE: password, ciphertext, iv, _pk, key, token, email, secret → `[redacted]` |
| Console prod | ✅ | Disabled sauf errors (sans data) sur hostname != localhost |
| `security_logs` Supabase | ✅ | auth, join_couple, transactions, delete_account — 90 jours retention |
| `LL.auditLog()` | ⚠️ | In-memory uniquement (200 events FIFO). Perdu au rechargement. Pas envoyé à Supabase. |
| Longueur payloads tronquée | ✅ | Strings > 200 chars tronqués dans les logs |
| Erreurs globales capturées | ✅ | `window.onerror` + `unhandledrejection` → LL.log |

---

## 8. Fonctions RPC — Sécurité

| RPC | Statut | Notes |
|-----|--------|-------|
| `create_couple_secure` | ✅ | Vérifie auth, pas déjà dans couple |
| `join_couple` | ✅ | Rate limit + security log + check expiration code + check couple plein |
| `add_transaction_secure` | ✅ | Validation amount, type, couple membership, account ownership |
| `update_transaction_secure` | ✅ | Recalcul delta atomique, vérifie compte dans même couple |
| `delete_transaction_secure` | ✅ | Reverse delta avant suppression |
| `rotate_invite_code` | ✅ | Restreint à partner1 uniquement |
| `delete_my_account` | ⚠️ | Supprime profil (cascade) mais auth.users reste orphelin. Comment dans RPC dit "sous 24h" — pas de cron implémenté. |
| `get_messages_page` | ✅ | Vérifie is_couple_member, limite 100 max |
| `get_transactions_page` | ✅ | Vérifie is_couple_member, limite 100 max |
| `delete_expired_messages` | ⚠️ | RPC existe mais **pas de cron configuré** → messages éphémères filtrés en lecture mais non supprimés en base. |

---

## Score Global

| Domaine | Score | Commentaire |
|---------|-------|-------------|
| Authentification | 7/10 | Email non confirmé non bloquant |
| RLS / DB | 9/10 | Architecture solide, RPCs bien conçus |
| Stockage clés | 8/10 | IndexedDB pour privkey, encryptLocal factice |
| Transport / CSP | 7/10 | unsafe-inline inévitable, frame-ancestors manquant |
| Validation inputs / XSS | 8/10 | esc() consistant, avatar_url sans limite taille |
| Permissions Android | 6/10 | FLAG_SECURE absent, permissions runtime à vérifier |
| Logs / Audit | 7/10 | LL redaction bonne, auditLog in-memory seulement |

**Score global : 7.5/10**

---

## Plan de Remédiation (Priorité)

| Priorité | Action | Effort |
|----------|--------|--------|
| 🔴 P1 | Cron Supabase → appel `delete_expired_messages()` toutes les heures | Faible |
| 🔴 P1 | Bloquer accès si email non confirmé (pas juste toast) | Faible |
| ⚠️ P2 | Créer RPC `delete_account_secure(id, keep_history)` pour fix suppression compte | Moyen |
| ⚠️ P2 | Ajouter `frame-ancestors 'none'` à la CSP | Très faible |
| ⚠️ P2 | Configurer `FLAG_SECURE` Android pour écran chat | Faible |
| ⚠️ P2 | Vérifier permissions runtime camera/micro/storage dans Capacitor | Faible |
| ℹ️ P3 | Supprimer `E2E.encryptLocal()` si non utilisée (fausse sécurité) | Très faible |
| ℹ️ P3 | Envoyer `LL.auditLog()` à `security_logs` Supabase pour les actions sensibles | Moyen |
| ℹ️ P3 | Mettre en place cron nettoyage auth.users orphelins post `delete_my_account()` | Moyen |
