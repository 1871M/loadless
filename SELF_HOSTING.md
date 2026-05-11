# Guide d'auto-hébergement — LoadLess

Ce guide décrit comment déployer LoadLess entièrement en local, sans aucune dépendance externe (zéro cloud, zéro GAFAM).

---

## Prérequis

- Docker ≥ 24 et Docker Compose v2
- Git
- Un navigateur moderne (Chrome, Firefox, Safari)

---

## 1. Démarrer Supabase en local

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

Éditez `.env` et changez au minimum :

```env
POSTGRES_PASSWORD=votre_mot_de_passe_fort
JWT_SECRET=votre_secret_jwt_32_chars_minimum
ANON_KEY=         # généré à l'étape 2
SERVICE_ROLE_KEY= # généré à l'étape 2
```

### 2. Générer les clés JWT

Utilisez <https://supabase.com/docs/guides/self-hosting#generate-api-keys> **hors ligne** avec l'outil `jwt-cli` :

```bash
# Installer jwt-cli (une seule fois)
cargo install jwt-cli  # ou : npm install -g jsonwebtoken-cli

# Générer ANON_KEY (role: anon, exp: lointain)
jwt encode --secret "votre_secret_jwt" '{"role":"anon","iss":"supabase","iat":1700000000,"exp":2000000000}'

# Générer SERVICE_ROLE_KEY (role: service_role)
jwt encode --secret "votre_secret_jwt" '{"role":"service_role","iss":"supabase","iat":1700000000,"exp":2000000000}'
```

Collez les valeurs dans `.env` puis :

```bash
docker compose up -d
```

Supabase Studio est accessible sur `http://localhost:8000`.

---

## 3. Appliquer le schéma SQL

1. Ouvrez Supabase Studio → **SQL Editor**
2. Collez le contenu de `SUPABASE_TOUT_EN_UN.sql`
3. Cliquez **Run**

---

## 4. Configurer LoadLess

Éditez `config.json` à la racine du projet :

```json
{
  "SURL": "http://localhost:8000",
  "SKEY": "<votre_ANON_KEY>"
}
```

> `SURL` pointe vers Kong (le gateway Supabase), port 8000 par défaut.

---

## 5. Servir l'application

```bash
# Depuis la racine du repo LoadLess
python3 -m http.server 3000
# ou : npx serve . -p 3000
```

Ouvrez `http://localhost:3000` dans votre navigateur.

> Pour une installation permanente, utilisez Nginx ou Caddy comme reverse proxy devant le dossier du projet.

---

## 6. Exemple Nginx (optionnel)

```nginx
server {
    listen 80;
    server_name loadless.local;
    root /opt/loadless;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## 7. Mise à jour

```bash
# Mettre à jour les libs locales après changement de version
curl -sSL "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/dist/umd/supabase.min.js" \
     -o assets/lib/supabase.min.js

# Recalculer les hashes SRI
cat assets/lib/supabase.min.js | openssl dgst -sha256 -binary | base64 -w0
cat assets/lib/qrcode.min.js   | openssl dgst -sha256 -binary | base64 -w0
# Mettre à jour les attributs integrity= dans index.html
```

---

## Sécurité

- Ne commitez **jamais** `config.json` si votre repo est public. Ajoutez-le à `.gitignore`.
- Changez `POSTGRES_PASSWORD` et `JWT_SECRET` avant toute exposition réseau.
- Le fichier `config.json` est exposé publiquement par le serveur HTTP — n'y mettez que la clé `anon` (lecture/écriture filtrée par RLS), jamais `service_role`.
