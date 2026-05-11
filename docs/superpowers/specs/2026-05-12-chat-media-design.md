# Chat Media E2E — Design Spec
Date: 2026-05-12

## Scope
Ajouter vocaux, photos, vidéos et fichiers au chat E2E existant. Inspiré Signal. Phase 2 (caméra intégrée) hors scope.

## Architecture

### Storage : Cloudflare R2
- Bucket `loadless-chat` (privé)
- Chemin fichier : `{couple_id}/{uuid}.enc`
- Accès via presigned URLs générées par Supabase Edge Functions (durée 5min)
- Aucun accès public direct

### Chiffrement E2E fichiers
- Même clé partagée ECDH-AES-GCM que les messages texte
- Flow upload : File → ArrayBuffer → AES-GCM encrypt (IV aléatoire) → blob chiffré → PUT presigned URL
- Flow download : GET presigned URL → blob chiffré → AES-GCM decrypt (IV stocké en DB) → Blob → ObjectURL
- Cache local décrypté : `Map<media_url, objectURL>` pour éviter re-téléchargement

### Base de données (messages)
Nouvelles colonnes :
```sql
media_url      text       -- chemin R2 (pas URL complète)
media_type     text       -- 'audio'|'image'|'video'|'file'
media_name     text       -- nom original
media_size     int        -- octets
media_duration int        -- secondes (audio/vidéo)
```
`ciphertext` = `[MEDIA_ENCRYPTED]` pour messages media (satisfait CHECK > 10)
`iv` = IV AES-GCM du fichier (base64)

### Edge Functions Supabase (Deno)
- `get-upload-url` : vérifie JWT → couple_id → retourne presigned PUT + clé fichier
- `get-download-url` : vérifie JWT → couple_id → retourne presigned GET

## UX (Signal-inspired)

### Barre de saisie
```
[ 📎 ] [ input ................. ] [ 🎤 ]
```

### Vocaux
- Press-hold 🎤 → MediaRecorder (WebM/Opus), max 5min
- Relâcher → encrypt → upload → envoi
- Glisser gauche pendant enregistrement → annulation
- Bulle : ▶ waveform duration 🔒

### Photos / Vidéos
- 📎 → picker `accept="image/*,video/*"`
- Image : resize canvas max 1920px (~200KB) avant chiffrement
- Vidéo : cap 100MB
- Bulle : thumbnail, tap → plein écran / lecteur

### Fichiers
- 📎 → picker `accept="*/*"`, cap 100MB
- Bulle : 📄 nom • taille [ ↓ ]

### Progress
- Barre de progression dans bulle pendant upload
- Bulle grisée jusqu'à confirmation DB

## Permissions Android
- `RECORD_AUDIO` (nouveau)
- `READ_MEDIA_VIDEO` (nouveau, Android 13+)

## Permissions-Policy
Retirer `microphone=()` → `microphone=(self)`

## Fichiers modifiés/créés
1. `supabase/functions/get-upload-url/index.ts` (nouveau)
2. `supabase/functions/get-download-url/index.ts` (nouveau)
3. `SUPABASE_TOUT_EN_UN.sql` — colonnes + storage policies
4. `index.html` — E2E file crypto, upload/download, UI vocaux, picker, bulles media
5. `android/app/src/main/AndroidManifest.xml` — RECORD_AUDIO + READ_MEDIA_VIDEO

## Setup manuel requis (Cloudflare + Supabase)
```
# R2
1. Cloudflare Dashboard → R2 → Create bucket "loadless-chat"
2. Manage R2 API tokens → Create token (Read+Write) → noter Account ID, Access Key, Secret Key

# Supabase secrets
supabase secrets set R2_ACCOUNT_ID=xxx
supabase secrets set R2_ACCESS_KEY_ID=xxx
supabase secrets set R2_SECRET_ACCESS_KEY=xxx
supabase secrets set R2_BUCKET_NAME=loadless-chat

# Deploy functions
supabase functions deploy get-upload-url
supabase functions deploy get-download-url
```
