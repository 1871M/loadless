# LoadLess v4.2 — Livrable d'audit complet

📅 Audit terminé le 7 mai 2026
🌿 Branche cible : `fix/audit-app-stability`

---

## 📦 Ce qui est dans ce dossier

### Fichiers à déployer (production)
- **`index.html`** — l'app modifiée (à pousser sur Netlify)
- **`manifest.json`** — inchangé depuis v4.1
- **`sw.js`** — ⭐ NOUVEAU — service worker complet
- **`offline.html`** — ⭐ NOUVEAU — page de fallback offline
- **`_headers`** — ⭐ NOUVEAU — config Netlify (cache + sécurité)
- **`_redirects`** — ⭐ NOUVEAU — config Netlify (SPA routing)
- **`SUPABASE_TOUT_EN_UN.sql`** — schéma DB mis à jour (à exécuter dans Supabase)

### Documentation (pour vous, pas à déployer)
- **`PR.md`** — description complète de la pull request, à coller sur GitHub/GitLab
- **`COMMITS.md`** — séquence de 14 commits atomiques avec messages prêts à utiliser
- **`AUDIT.md`** — rapport d'audit détaillé (23 points analysés)
- **`CHANGELOG.md`** — changelog v4.2
- **`CHANGELOG-v4.1.md`** — ancien changelog conservé
- **`DEPLOY.md`** — ⭐ guide pas-à-pas Netlify + Supabase + checklist post-deploy

---

## 🚀 Pour déployer (TL;DR)

### 1. Supabase (faire en premier !)
1. Aller sur votre projet Supabase → SQL Editor → New query
2. Coller TOUT le contenu de `SUPABASE_TOUT_EN_UN.sql`
3. Run ▶️
4. Vérifier que les nouvelles fonctions sont là : `update_transaction_secure`, `delete_my_account`

### 2. Netlify
1. Glisser-déposer le dossier `loadless-v4.2/` sur https://app.netlify.com/drop
   (avec votre dossier `icons/` à l'intérieur)
2. Netlify détecte automatiquement `_headers` et `_redirects`
3. C'est en ligne en 30 secondes

### 3. Tester
Voir checklist détaillée dans `DEPLOY.md` section 3️⃣.

---

## 🐛 Si vous voulez créer la PR proprement (Git)

```bash
# Dans votre repo
git checkout -b fix/audit-app-stability

# Copier les fichiers (depuis ce dossier vers votre repo)
cp loadless-v4.2/index.html .
cp loadless-v4.2/SUPABASE_TOUT_EN_UN.sql .
cp loadless-v4.2/sw.js .
cp loadless-v4.2/offline.html .
cp loadless-v4.2/_headers .
cp loadless-v4.2/_redirects .
cp loadless-v4.2/CHANGELOG.md .
cp loadless-v4.2/CHANGELOG-v4.1.md .
cp loadless-v4.2/AUDIT.md .
cp loadless-v4.2/DEPLOY.md .

# Voir COMMITS.md pour la séquence de 14 commits atomiques
# OU faire un seul commit (squash merge à la fin) :
git add .
git commit -m "chore: audit complet v4.2 — voir CHANGELOG.md"
git push origin fix/audit-app-stability

# Créer la PR sur GitHub/GitLab et coller le contenu de PR.md dans la description
```

---

## ✅ Récap des corrections (top 5)

1. **Édition de transaction non atomique** → nouvelle RPC `update_transaction_secure`
   + fallback avec restauration. Plus de perte de données possible.
2. **Calendrier non chargé au démarrage** → widget upcoming et calcul d'équité justes
   dès la 1re ouverture.
3. **Bouton « 🤝 Aider » jamais branché** → maintenant utilisable, le code mort devient
   feature.
4. **Suppression de compte RGPD-incomplète** → nouvelle RPC `delete_my_account` côté SQL.
5. **Service Worker absent en prod** → `sw.js` + `offline.html` complets fournis.

Plus 9 autres fixes (sanitization, accessibilité, dédup ingrédients, division par zéro,
RLS explicite…). Détails dans `CHANGELOG.md` et `AUDIT.md`.

---

## ❓ FAQ rapide

**Q : Je dois faire le SQL avant ou après le push frontend ?**
R : SQL en premier. Le frontend dégrade gracieusement si la nouvelle RPC manque (fallback
sur l'ancien comportement), mais c'est moins propre.

**Q : Que se passe-t-il pour les utilisateurs déjà connectés ?**
R : Ils continuent à utiliser l'app. Au prochain rechargement, le SW met à jour la coquille
(toast informatif déjà en place). Aucune perte de données ni de session.

**Q : Pourquoi mon ancien dossier n'a pas `sw.js` / `offline.html` ?**
R : Le brief v4.1 mentionnait ces fichiers comme "inchangés", mais ils n'étaient pas
fournis dans l'upload de cette session. Je les ai créés from scratch en cohérence avec
le code de `index.html`.

**Q : Est-ce que ça casse la compatibilité avec v4.1 ?**
R : Non. Les nouvelles RPC sont ajoutées (pas de remplacement). Le frontend a des
fallbacks si elles ne sont pas encore en place. Les nouvelles policies SQL ne touchent
pas les chemins existants.

**Q : Les apostrophes dans `onclick` ont été re-vérifiées ?**
R : Oui — script de validation passé, 0 occurrence buggée détectée. Le bug original
(v4.0) ne se reproduit pas.
