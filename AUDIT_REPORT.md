# Rapport d'Audit de Sécurité — LoadLess v4.3

**Date :** 2026-05-11  
**Périmètre :** Repo complet (`index.html`, `sw.js`, `SUPABASE_TOUT_EN_UN.sql`, fichiers de config)  
**Méthode :** SAST manuel + revue de code + tests automatisés

---

## Résumé exécutif

| Sévérité | Trouvé | Corrigé |
|----------|--------|---------|
| 🔴 Critique | 1 | 1 |
| 🟠 Haute | 2 | 2 |
| 🟡 Moyenne | 3 | 3 |
| 🟢 Faible | 2 | 2 |

**Statut global : ✅ Tous les problèmes identifiés ont été corrigés.**

---

## Findings

### 🔴 [CRIT-01] XSS dans `toast()` via `innerHTML` avec contenu non échappé

**Fichier :** `index.html` (ancienne ligne ~1476)  
**Description :** La fonction `toast(msg)` injectait `msg` directement dans `innerHTML`. Si un message d'erreur Supabase contenait des caractères HTML, cela pouvait déclencher une exécution de script.  
**Vecteur :** Message d'erreur serveur contenant balises HTML ou attributs d'événements.  
**Correction appliquée :** Remplacement par `textContent` pour les deux spans du toast.

---

### 🟠 [HIGH-01] Fallback `_directInsert()` contournant la RLS `tx_block_direct_insert`

**Fichier :** `index.html` (ancienne ligne ~2792)  
**Description :** En cas d'échec de la RPC `add_transaction_secure`, le code tombait sur `_directInsert()` qui tentait un `INSERT` direct sur `transactions`. Même bloqué par la RLS, cela constituait un vecteur de confusion et d'erreurs silencieuses.  
**Correction appliquée :** Suppression du fallback. Seule la RPC est autorisée. Erreur explicite affichée à l'utilisateur.

---

### 🟠 [HIGH-02] UUID incorrect dans le state local après création de transaction

**Fichier :** `index.html` (ancienne ligne ~2787)  
**Description :** `data?.id` utilisé au lieu de `data?.transaction_id` — l'UUID stocké localement ne correspondait pas à l'UUID réel en base. La subscription realtime pouvait créer un doublon.  
**Correction appliquée :** `data?.id` → `data?.transaction_id`.

---

### 🟡 [MED-01] Dépendances CDN externes (supply chain)

**Fichier :** `index.html` (anciennes lignes 32-33)  
**Description :** Supabase SDK et QRCode chargés depuis `cdn.jsdelivr.net`. Un CDN compromis aurait pu injecter du code malveillant.  
**Correction appliquée :**  
- Libs téléchargées dans `assets/lib/`  
- Attributs `integrity="sha256-..."` ajoutés (SRI)  
- `cdn.jsdelivr.net` retiré de la CSP

---

### 🟡 [MED-02] CSP autorisait `cdn.jsdelivr.net` dans `script-src`

**Fichier :** `index.html` (ligne 12) et `_headers`  
**Description :** La Content Security Policy incluait `https://cdn.jsdelivr.net` comme source de scripts autorisée.  
**Correction appliquée :** Directive `script-src` réduite à `'self' 'unsafe-inline'` après localisation des libs.

---

### 🟡 [MED-03] `SURL` et `SKEY` hardcodés dans `index.html`

**Fichier :** `index.html` (anciennes lignes 1135-1136)  
**Description :** Rendait impossible le déploiement self-hosted sans modifier le source.  
**Correction appliquée :** Externalisés dans `config.json` avec fallback au BOOT.  
**Note :** `SKEY` est la clé `anon` (publique par conception). La clé `service_role` n'est jamais exposée côté client.

---

### 🟢 [LOW-01] Absence de verrouillage d'inactivité

**Description :** Aucun mécanisme ne déconnectait l'utilisateur après une période d'inactivité.  
**Correction appliquée :** Timer IIFE de 5 minutes — déclenchement de `sb.auth.signOut()` + retour à l'écran d'auth.

---

### 🟢 [LOW-02] Modales sans `trapFocus` ni attributs ARIA

**Description :** Le focus clavier pouvait sortir des modales, rendant l'app inaccessible au clavier et aux lecteurs d'écran.  
**Correction appliquée :**  
- `trapFocus()` ajouté et branché dans `openM()`/`closeM()`  
- `role="dialog"` et `aria-modal="true"` ajoutés dynamiquement  
- `aria-live="polite"` sur `#toast-wrap`

---

## Points positifs confirmés

- ✅ **E2EE chat** : ECDH P-256 + HKDF + AES-GCM 256 — implémentation correcte
- ✅ **RLS transactions** : politiques bloquantes sur insert/update/delete directs
- ✅ **PBKDF2 sauvegardes** : 100 000 itérations SHA-256, sel aléatoire 16 octets, IV aléatoire 12 octets
- ✅ **Zéro dépendance Google/Meta/Amazon/Apple** dans le code frontend
- ✅ **Polices système** uniquement (`@font-face` local)
- ✅ **`esc()`** utilisé systématiquement pour les données utilisateur rendues en HTML
- ✅ **Aucune évaluation de code dynamique** (`eval`, constructeur Function, setTimeout avec chaîne)

---

## Tests de sécurité automatisés

| Fichier | Couverture |
|---------|------------|
| `tests/security/test_rls_bypass.py` | Insert/update/delete directs, lecture inter-couple, RPC non autorisée |
| `tests/security/test_sql_injection.py` | 8 payloads SQLi × 3 points d'entrée |
| `tests/security/test_backup_crack.py` | Bruteforce, falsification, replay, longueur de clé, PBKDF2 |

```bash
# Exécuter tous les tests de sécurité
pip install supabase pytest cryptography
export SURL="..." SKEY_ANON="..." TEST_EMAIL="..." TEST_PASSWORD="..."
pytest tests/security/ -v
```
