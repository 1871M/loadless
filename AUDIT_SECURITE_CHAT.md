# AUDIT SÉCURITÉ CHAT — Loadless v4.6.1
**Branch:** `feat/major-refactor-v2`  
**Date:** 2026-05-12  
**Scope:** Chiffrement E2E, messages éphémères, médias R2, métadonnées, fuites

---

## Légende
| Symbole | Gravité |
|---------|---------|
| ✅ | Sécurisé |
| ℹ️ | Informatif / non critique |
| ⚠️ | Risque modéré — à corriger |
| 🔴 | Risque élevé — correction prioritaire |

---

## 1. Chiffrement E2E — Architecture

### Protocole
```
ECDH P-256 (clés identité long terme)
  → deriveKey (WebCrypto) → AES-GCM 256 bits
  IV : 96 bits aléatoire par message (NIST recommandé)
  Tag : 128 bits (maximum AES-GCM)
  Clé privée : IndexedDB 'll-k' v2 (jamais transmise)
  Clé publique : profiles.public_key (Supabase)
```

| Élément | Statut | Détail |
|---------|--------|--------|
| Algorithme clés | ✅ | ECDH P-256 — standard recommandé |
| Algorithme chiffrement | ✅ | AES-GCM 256 bits |
| Taille IV | ✅ | 96 bits par message — conforme NIST SP 800-38D |
| Tag d'authenticité | ✅ | 128 bits (max) — protège contre forgery |
| Clé privée en IndexedDB | ✅ | Pas dans localStorage, meilleure isolation |
| Clé privée jamais transmise | ✅ | Seule la clé publique (`spki` base64) va en DB |
| Dérivation clé partagée | ⚠️ | `crypto.subtle.deriveKey({name:'ECDH',...}, myPriv, {name:'AES-GCM', length:256})` — utilise WebCrypto ECDH KDF interne (X9.63), pas HKDF explicite. Le commentaire dans le code dit "via HKDF" — **trompeur**. Fonctionnellement sécurisé mais sans salt/context = dérivation simple du point partagé. |
| Forward secrecy (PFS) | ⚠️ | Même `sharedKey` pour tous les messages du couple. Pas de Diffie-Hellman éphémère par message. Si la clé privée est compromise, TOUS les messages passés (accessibles en DB) sont déchiffrables. `E2E.genSession()` existe dans le code mais n'est pas utilisée pour le chiffrement des messages. |
| Rotation des clés identité | ✅ | 7 jours via `shouldRotate()`. Génère nouvelle paire, met à jour `profiles.public_key`. |
| Détection changement clé partenaire | ✅ | Hash fingerprint (SHA-256 de la clé publique) comparé à chaque chargement. Alerte + blocage chat si changement non confirmé. |
| Fingerprint vérification | ✅ | Affiché dans Paramètres → Sécurité. Utilisateur peut vérifier out-of-band. |
| Vérification base64 avant envoi | ✅ | `try{atob(enc.ct);atob(enc.iv);}catch{...return;}` — bloque ciphertext invalide |
| Triple vérification avant envoi | ✅ | `!enc?.ct || !enc?.iv || enc.ct.length<10 || enc.iv.length<5` |
| Plaintext jamais en base | ✅ | `messages.ciphertext` = ciphertext base64, jamais le texte clair |

### Bug connu résolu (Phase 4)
**Rotation key sur reinstall Android** : si localStorage vidé (reinstall) mais IndexedDB intact → `shouldRotate()` retournait `true` → nouvelle paire générée → partner voit fingerprint change → `sharedKey=null` → chat bloqué. **Fix:** si timestamp absent mais clé privée présente en IDB, restaurer le timestamp sans régénérer. ✅

---

## 2. Messages Éphémères

| Élément | Statut | Détail |
|---------|--------|--------|
| Champ `expires_at` en DB | ✅ | `timestamptz nullable` dans `messages` |
| Filtre lecture | ✅ | `get_messages_page()` : `expires_at IS NULL OR expires_at > now()` |
| Durées configurables | ✅ | Off/1h/24h/7j/30j/Personnalisé — settings Paramètres |
| Appliqué à texte + médias | ✅ | `sendMsg()` et `sendMediaMsg()` utilisent `_ephDur` |
| Suppression physique | 🔴 | `delete_expired_messages()` RPC existe **mais aucun cron n'est configuré**. Les messages expirés sont filtrés en lecture mais restent physiquement en base indéfiniment. |
| Réception realtime | ⚠️ | Un message éphémère peut être livré via Supabase Realtime au partenaire connecté après expiration si le cron ne tourne pas. Realtime insert-event arrive avant l'expiry check. |
| Indicateur visuel | ⚠️ | Bulle affiche `⏱` si expires_at présent. Pas de compte à rebours visible. |
| Sync preference | ✅ | `_ephDur` global synchro avec `A.eph`, `prefs.ephDur` — fix Phase 4 consolidation `togEph()` |

**Remédiation critique (cron) :**
```sql
-- Dans Supabase Dashboard → Database → Extensions → pg_cron
SELECT cron.schedule('delete-expired-msgs', '0 * * * *',
  'SELECT delete_expired_messages()');
```

---

## 3. Médias R2

### Chiffrement médias
| Élément | Statut | Détail |
|---------|--------|--------|
| Chiffrement avant upload | ✅ | `_encFile()` : `crypto.subtle.encrypt({name:'AES-GCM',iv}, A.sharedKey, buffer)` |
| Clé utilisée | ⚠️ | `A.sharedKey` — même clé que pour les messages texte. Séparation des clés texte/media serait plus robuste mais non critique. |
| IV stocké en DB | ✅ | `messages.iv` = base64(iv media) — nécessaire pour déchiffrement |
| Déchiffrement client-side | ✅ | `_downloadMedia()` → `_decFile()` après download depuis R2 |
| Upload via presigned URL | ✅ | `get-upload-url` edge function génère PUT presigned URL |
| Content-Type upload | ⚠️ | `'Content-Type': 'application/octet-stream'` — correct pour binaire chiffré. Ne révèle pas le type MIME original. ✅ |

### Accès R2
| Élément | Statut | Détail |
|---------|--------|--------|
| Authentification upload | ✅ | JWT Supabase vérifié dans `get-upload-url` edge function |
| Authentification download | ✅ | JWT Supabase vérifié dans `get-download-url` edge function |
| Path traversal protection | ✅ | `get-download-url` vérifie `key.startsWith(couple_id+'/')` |
| Isolation par couple | ✅ | Clé R2 = `{couple_id}/{fileId}.enc` |
| Expiration presigned URLs | ⚠️ | Non visible dans le code client. Dépend de la config R2/edge function. Vérifier que PUT URL expire en < 5 min, GET URL en < 15 min. |
| Accès direct R2 sans JWT | ✅ | R2 bucket non public — accès uniquement via presigned URLs générées par edge functions authentifiées |

### Cache médias
| Élément | Statut | Détail |
|---------|--------|--------|
| `_mediaCache` Map | ✅ | Évite re-download + re-déchiffrement |
| Blob URLs révoquées | ⚠️ | `URL.createObjectURL()` créé, **jamais révoqué** (`URL.revokeObjectURL()` absent dans `_downloadMedia`). Fuite mémoire en session longue + blob URL valide indéfiniment en mémoire (jusqu'au reload). |
| Cache non persisté | ✅ | `Map` en mémoire — vidée au reload, pas de persistence des blobs |

**Remédiation blob URL :**
```js
// Stratégie LRU simple — révoquer quand cache dépasse N entrées
const MAX_CACHE=50;
function _addToMediaCache(key, url){
  if(_mediaCache.size>=MAX_CACHE){
    const firstKey=_mediaCache.keys().next().value;
    URL.revokeObjectURL(_mediaCache.get(firstKey));
    _mediaCache.delete(firstKey);
  }
  _mediaCache.set(key,url);
}
```

---

## 4. Métadonnées — Exposition

Les éléments suivants sont **stockés non chiffrés** dans la table `messages` et sont visibles pour tout accès DB (admin Supabase, backup DB, compromission Supabase) :

| Champ | Chiffré | Exposé à |
|-------|---------|----------|
| `ciphertext` | ✅ | — |
| `iv` | ℹ️ | IV seul, pas de risque — iv n'est pas secret |
| `sender_id` | ❌ | Qui envoie à qui |
| `couple_id` | ❌ | Quel couple communique |
| `created_at` | ❌ | Timing des messages |
| `expires_at` | ❌ | Révèle utilisation messages éphémères |
| `media_type` | ❌ | Révèle si audio/image/vidéo/fichier (pas le contenu) |
| `media_size` | ❌ | Taille approximative du media |
| `media_duration` | ❌ | Durée audio/vidéo |
| `media_name` | ❌ | Nom original du fichier |
| `version` | ℹ️ | Version protocole (1 ou 2) |

**Évaluation :** Pour une app couple grand public, ce niveau de métadonnées est acceptable. Un adversaire avec accès DB sait "qui, quand, type de média, durée" mais pas le contenu. Pour un contexte haute sensibilité, le chiffrement des métadonnées (media_type, media_size, media_name dans le ciphertext) serait recommandé.

---

## 5. Fuites Potentielles

| Vecteur | Statut | Détail |
|---------|--------|--------|
| Console logs en prod | ✅ | Désactivés (sauf erreurs sans data) sur hostname != localhost |
| Logs LL en mémoire | ✅ | SENSITIVE redaction + 200 events FIFO max |
| `LL.exportLogs()` accessible | ⚠️ | Exposé globalement via `window.LL` indirect. Un attaquant avec accès console peut appeler `LL.exportLogs()`. Pas critique car les données sensibles sont redactées. |
| Capture d'écran Android | ⚠️ | `FLAG_SECURE` non configuré (voir audit app). Screenshots d'écran chat possibles. |
| Backup export | ✅ | Messages NON inclus dans backup (pas de `msgs:A.msgs` dans payload). Intentionnel — messages déchiffrables uniquement sur l'appareil avec la clé privée. |
| Backup import | ⚠️ | `importBackup()` tente upsert transactions directement → bloqué par RLS. Import partiel (tasks/shop/accounts/meals/cal OK, transactions KO). |
| Clipboard | ℹ️ | `copyCode()` copie le code d'invitation. Clipboard auto-clear non implémenté. |
| Fingerprint exposé | ✅ | Affiché uniquement dans Paramètres, formaté en hex court (SHA-256 tronqué). |

---

## 6. Sauvegarde

| Élément | Statut | Détail |
|---------|--------|--------|
| Chiffrement backup | ✅ | PBKDF2 100,000 iterations SHA-256 + AES-GCM 256 bits |
| Salt aléatoire | ✅ | `crypto.getRandomValues(16)` par export |
| IV aléatoire | ✅ | `crypto.getRandomValues(12)` par export |
| Messages exclus | ✅ | Correct — messages chiffrés non transférables hors device |
| Format fichier | ✅ | JSON `{v:1, salt, iv, data}` — structure simple et vérifiable |
| Brute-force | ⚠️ | 100k iterations PBKDF2-SHA256 = ~50ms sur CPU moderne. Acceptable mais PBKDF2 reste inférieur à Argon2id ou scrypt. Pour upgrade futur. |

---

## Score Sécurité Chat

| Domaine | Score | Commentaire |
|---------|-------|-------------|
| Chiffrement E2E | 8/10 | AES-GCM 256 + ECDH P-256 solide. Dérivation sans HKDF explicite, commentaire trompeur. |
| Forward Secrecy | 5/10 | Pas de PFS par message. Compromise clé privée = tous les messages déchiffrables. `genSession()` existe mais non utilisée. |
| Messages éphémères | 6/10 | Filtre lecture OK mais suppression physique jamais déclenchée (pas de cron). |
| Médias R2 | 8/10 | Chiffrement bout-en-bout, presigned URLs, path traversal protégé. Blob cache jamais révoqué. |
| Métadonnées | 6/10 | Timing, taille, type media, sender_id non chiffrés. Acceptable pour usage couple. |
| Fuites / Logs | 8/10 | Redaction propre. FLAG_SECURE absent. |
| Backup | 8/10 | Bon chiffrement. PBKDF2 acceptable, Argon2id serait meilleur. |

**Score global sécurité chat : 7/10**

---

## Plan de Remédiation (Priorité)

| Priorité | Action | Effort |
|----------|--------|--------|
| 🔴 P1 | Configurer cron Supabase → `delete_expired_messages()` toutes les heures | Très faible |
| ⚠️ P2 | Révoquer blob URLs dans `_mediaCache` (LRU ou à la suppression message) | Faible |
| ⚠️ P2 | `FLAG_SECURE` Android pour empêcher screenshots chat | Faible |
| ⚠️ P2 | Vérifier expiration presigned URLs R2 (PUT < 5min, GET < 15min) | Faible |
| ⚠️ P2 | Corriger commentaire "via HKDF" dans E2E.deriv() — misleading | Très faible |
| ℹ️ P3 | Utiliser clés distinctes texte vs média (HKDF avec info différent) | Moyen |
| ℹ️ P3 | Implémenter PFS par session en utilisant `E2E.genSession()` déjà présent | Élevé |
| ℹ️ P3 | Chiffrer `media_type`, `media_size`, `media_name` dans payload JSON chiffré | Moyen |
| ℹ️ P3 | Upgrader PBKDF2 → Argon2id pour backup (quand WebCrypto le supportera) | Élevé |
