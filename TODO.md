# TODO — feat/major-refactor-v2

Branche : `feat/major-refactor-v2`  
Décisions clés :
- Équité → intégrée dans Paramètres (pas de page séparée ni lien)
- Push → OneSignal
- Suppression compte bancaire → proposer le choix à l'utilisateur

---

## PHASE 1 — RESTRUCTURATION UI

- [ ] 1. Renommer onglet "Profil" → "Paramètres" (label, aria-label, références JS)
- [ ] 2. Supprimer onglet "Équité" de la nav principale + drawer (garder la page/code pour intégration dans Paramètres)
- [ ] 3. Remplacer icône cloche → icône roue crantée (même DA, même action → ouvre Paramètres)
- [ ] 4a. Supprimer le recentrage automatique de l'onglet actif dans la bottom nav
- [ ] 4b. Augmenter zone morte bords pour réduire swipes involontaires (dx min 70px, guard bord gauche 60px)
- [ ] Build test + Commit + Push

## PHASE 2 — NETTOYAGE PARAMÈTRES

- [ ] 5. Supprimer "Restaurer la sauvegarde" (UI + BackupManager.importBackup) — garder Export
- [ ] 6a. Supprimer toggles "Contraste élevé", "Texte agrandi", "Réduire les animations" de l'UI
- [ ] 6b. Forcer highContrast=true en dur dans CSS/JS (plus de toggle utilisateur)
- [ ] 7. Supprimer section "Modules" entièrement (UI + liens)
- [ ] Build test + Commit + Push

## PHASE 3 — AJOUTS FONCTIONNELS

- [ ] 8. Paramètres → Section Sécurité : sélecteur durée messages éphémères (Off/1h/24h/7j/30j/Personnalisé)
- [ ] 9. Paramètres → Section Compte : bouton "Régénérer mon code d'invitation" avec logique partenaire
- [ ] 10. Onglet Budget : suppression compte bancaire avec double confirmation + choix transactions
- [ ] Build test + Commit + Push

## PHASE 4 — BUGS BLOQUANTS

- [ ] 11. Bug photo de profil non modifiable — debug + fix (Capacitor Camera, upload R2, preview)
- [ ] 12. Bug envoi messages texte impossible — debug + fix (sendMsg, sharedKey, RLS)
- [ ] 13a. Bouton "+" médias dans le chat (image, vidéo, fichier, micro)
- [ ] 13b. Vocal : appui long → enregistrement, relâchement → envoi, waveform/timer
- [ ] 13c. Image/vidéo/fichier : sélecteur natif Capacitor
- [ ] 13d. Preview avant envoi tous médias
- [ ] 13e. Upload R2 chiffré (déjà partiellement implémenté)
- [ ] 13f. Affichage : image zoom, vidéo inline, fichier téléchargeable, vocal player
- [ ] 13g. Sélecteur vitesse lecture x0.5/x1/x1.15/x1.30/x1.5/x1.75/x2 (vocaux + vidéos)
- [ ] 13h. Gestion erreurs (taille max, types, permissions)
- [ ] Build test + Commit + Push

## PHASE 5 — NOTIFICATIONS PUSH (OneSignal)

- [ ] 5.1. Setup : @capacitor/push-notifications + OneSignal, AndroidManifest, config files
- [ ] 5.2. Token management : permission, device_tokens table Supabase, refresh
- [ ] 5.3. Triggers backend : Edge Functions pour tâches/budget/courses/repas/chat
- [ ] 5.4. UI Paramètres : section Notifications par catégorie + table notification_prefs
- [ ] 5.5. Tests
- [ ] Build test + Commit + Push

## PHASE 6 — VÉRIFICATIONS & AUDITS

- [ ] 14. Tests non-régression toutes features
- [ ] 15. AUDIT_FONCTIONNEL.md
- [ ] 16. AUDIT_SECURITE_APP.md (note /10)
- [ ] 17. AUDIT_SECURITE_CHAT.md (note /10)
- [ ] Commit + Push final

---

## INTÉGRATION ÉQUITÉ DANS PARAMÈTRES

> Décision : le contenu de `renderEquity()` sera intégré dans `renderSettings()` comme section dédiée.  
> La page `p-equity` et la fonction `renderEquity()` restent dans le code mais ne sont plus accessibles via nav.

---

## NOTES TECHNIQUES

- `index.html` : fichier unique 4903 lignes (HTML+CSS+JS)
- Pas de bundler — `npx cap sync` suffit pour Android
- Swipe actuel : threshold `dx < 50`, guard bord gauche `_sx < 40`
- Auto-scroll nav : `inner.scrollTo({left:...,behavior:'smooth'})` ligne ~2229
- CSP : connect-src ne liste pas les domaines R2 → bloquer fetches R2 côté web (Capacitor Android peut contourner)
- `rotate_invite_code` RPC existe déjà en DB
- `BackupManager.importBackup()` ligne 4188 à supprimer (garder export)
