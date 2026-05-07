# LoadLess — Corrections appliquées (v4.1)

Fichier modifié : `index.html` (3651 lignes, +485 vs version originale)
Fichier modifié : `manifest.json` (ajout du raccourci Agenda)

## 🔥 Bugs critiques corrigés

### 1. Boutons modifier/supprimer transactions cassés
**Bug** : ligne 2162-2163 du fichier original, les `onclick` des boutons étaient
construits avec `''+tx.type+''` (apostrophes manquantes) au lieu de
`\''+tx.type+'\''`. Résultat : `onclick="openTx(expense,xyz)"` — JS invalide,
boutons inertes.

**Fix** : échappement correct des apostrophes. Les boutons fonctionnent.

### 2. Onglet Agenda « disparu »
**Bug** : 8 onglets dans la bottom-nav sur mobile → écrasement visuel,
impossible de cliquer correctement sur Agenda. Le bouton existait mais
était inutilisable.

**Fix** : refonte complète de la nav. Passage à 5 onglets principaux
visibles (Accueil, Tâches, Agenda, Budget, Chat) + un bouton « Plus »
qui ouvre un menu pour les modules secondaires (Courses, Repas, Équité,
Profil). Suppression du doublon CSS `.bot-nav`.

### 3. Bouton « + » courses inefficace
**Bug** : Le FAB scrollait vers un input en haut de page, ce qui
était fragile. La fonction `editShop` utilisait `prompt()` natif (mauvaise UX).

**Fix** : nouveau modal dédié pour ajout/édition d'article (champs nom,
quantité, catégorie). `editShop()` réutilise ce modal. La barre d'ajout
rapide en haut de la liste continue de fonctionner avec la touche Entrée.

### 4. Équité avec base 20h au lieu de 96h
**Bug** : `A.avail[id]||20` partout. La logique métier prévoit 96h
(semaine 6h-23h × 7j ≈ 96h utiles).

**Fix** : constante `DEFAULT_AVAIL_HOURS=96`. Inputs `max="120"` au lieu
de `max="80"`. Détail du calcul exposé via `<details>` dans la page Équité.

## 🟢 Améliorations majeures

### 5. Historique d'équité
- Snapshot quotidien automatique dans `localStorage` (60 derniers jours)
- Modal « Voir l'historique » avec sparkline visuel des 30 derniers jours
- Stats : moyennes, écart moyen, détail des 7 derniers jours

### 6. Détection automatique des abonnements (Budget)
- Algorithme heuristique : transactions au titre normalisé identique,
  montant similaire (±5%), intervalle 25-35 jours = abonnement détecté
- Panneau dépliable « Abonnements détectés » avec total mensuel
- Distinction visuelle entre abonnements déclarés (`recurring`) et détectés

### 7. Module Profil restructuré (5 sections)
1. En-tête utilisateur (avec bouton « Modifier mon profil »)
2. Votre foyer (code d'invitation, partenaire)
3. Modules (Équité, Repas)
4. Sécurité & chiffrement (clés E2E)
5. Préférences (vibrations, animations réduites, contraste élevé, texte agrandi)
6. Compte (déconnexion)
7. Zone de danger (suppression compte)

### 8. Édition du profil
- Modal `openProfileEdit()` avec champ pseudo + sélecteur de couleur
- Sauvegarde dans Supabase via `profiles.update()`
- Mise à jour live de l'avatar dans le header

### 9. Préférences d'accessibilité
- Toggles persistés dans `localStorage` (`ll-prefs`)
- Application au runtime via classes sur `<html>`
- `prefers-reduced-motion` respecté nativement aussi

## ♿ Accessibilité

- Tailles tactiles min 44×44px sur tous les boutons (WCAG)
- `:focus-visible` global avec outline 3px (clavier)
- Rôles ARIA : `role="navigation"`, `role="dialog"`, `role="menu"`, `role="link"`
- `aria-label` sur les boutons d'icône
- `aria-expanded` sur le menu Plus
- `prefers-reduced-motion` honoré
- Mode contraste élevé disponible (variables CSS surchargées)
- Mode texte agrandi (+15%) disponible
- Navigation clavier : `Échap` ferme le menu Plus, `Entrée/Espace` activent le logo

## 🔐 Sur la « clé SKEY exposée »

**Pas un bug.** `SKEY` est la clé `anon` de Supabase. Son rôle EST d'être
exposée côté client. Ce qui protège les données, c'est la **Row Level
Security** (RLS), déjà activée sur toutes les tables (vérifié dans
`SUPABASE_TOUT_EN_UN.sql` lignes 156-166). Cacher la clé anon derrière
un proxy serait du theatre sécuritaire qui complique sans rien protéger.

Pour une vraie amélioration sécuritaire, regarder plutôt :
- les policies RLS de chaque table (déjà en place)
- la rotation des clés anon dans le projet Supabase (côté ops)
- l'audit régulier de `security_logs`

## 📐 Cohérence des données entre modules

- L'équité agrège : tâches partagées + heures d'agenda + disponibilité
  utilisateur
- Tous les calculs passent par `calcEquity()` (source unique de vérité)
- Le snapshot historique utilise `couple_id` comme clé de partition
- Les préférences restent locales à l'appareil (pas de fuite cross-couple)

## ⚠️ Risques identifiés

1. **localStorage limité** (~5MB sur mobile). L'historique d'équité
   est plafonné à 60 jours pour éviter la saturation.
2. **Détection d'abonnements heuristique** : faux positifs possibles
   (ex : achats récurrents à un magasin de quartier). L'utilisateur peut
   marquer manuellement comme `recurring` si nécessaire.
3. **Menu Plus** : nécessite un clic supplémentaire pour Courses/Repas.
   Acceptable car ces modules sont moins fréquents que Tâches/Budget/Agenda.

## ❓ Non touché (et pourquoi)

- **Messagerie auto-suppression** : la fonctionnalité existe déjà
  (sélecteur 1h/24h/3j/7j ligne 727 du fichier original).
- **Affichage clé de sécurité** : déjà implémenté via `showFingerprint()`
  avec QR code (lignes 2641+ de l'original).
- **Multi-utilisateur sur tâches** : déjà géré via `assignee_id`,
  `helper_id`, `validated_by`.

