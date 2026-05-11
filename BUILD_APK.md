# Construire l'APK LoadLess (F-Droid / Distribution directe)

## Prérequis

| Outil | Version |
|-------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| JDK | 17 (OpenJDK) |
| Android SDK | API 33+ (Build Tools 33.x) |
| Gradle | géré automatiquement par le wrapper |

```bash
# Ubuntu/Debian
sudo apt install openjdk-17-jdk nodejs npm
# Android SDK via sdkmanager (sans Android Studio)
sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.2"
```

---

## 1. Installer les dépendances Capacitor

```bash
cd /home/loadless/loadless
npm install
```

## 2. Ajouter la plateforme Android

```bash
npx cap add android
npx cap sync
```

> `cap sync` copie les fichiers web dans `android/app/src/main/assets/public/`
> et synchronise les plugins.

---

## 3. Générer un keystore de signature

```bash
keytool -genkey -v \
  -keystore loadless-release.keystore \
  -alias loadless \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -storepass VOTRE_MOT_DE_PASSE_STORE \
  -keypass  VOTRE_MOT_DE_PASSE_CLE \
  -dname "CN=LoadLess, OU=LoadLess, O=LoadLess, L=Local, ST=Local, C=FR"
```

> Conservez `loadless-release.keystore` en lieu sûr. **Sans lui, vous ne pourrez
> pas publier de mises à jour.**

Vérifiez le keystore :

```bash
keytool -list -v -keystore loadless-release.keystore -storepass VOTRE_MOT_DE_PASSE_STORE
```

---

## 4. Configurer la signature Gradle

Créez `android/app/keystore.properties` (hors du contrôle de version) :

```properties
storeFile=../../loadless-release.keystore
storePassword=VOTRE_MOT_DE_PASSE_STORE
keyAlias=loadless
keyPassword=VOTRE_MOT_DE_PASSE_CLE
```

Dans `android/app/build.gradle`, ajoutez dans le bloc `android {}` :

```groovy
def keystorePropertiesFile = rootProject.file("app/keystore.properties")
def keystoreProperties = new Properties()
keystoreProperties.load(new FileInputStream(keystorePropertiesFile))

signingConfigs {
    release {
        storeFile     file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
        keyAlias      keystoreProperties['keyAlias']
        keyPassword   keystoreProperties['keyPassword']
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
    }
}
```

---

## 5. Compiler l'APK release

```bash
cd android
./gradlew assembleRelease
```

L'APK se trouve dans :
```
android/app/build/outputs/apk/release/app-release.apk
```

---

## 6. Vérifier et signer manuellement (optionnel)

Si vous préférez signer avec `apksigner` :

```bash
# Compiler unsigned
./gradlew assembleRelease -Pandroid.injected.signing.store.file=/dev/null

# Zipalign
zipalign -v 4 app-release-unsigned.apk app-release-aligned.apk

# Signer
apksigner sign \
  --ks ../../loadless-release.keystore \
  --ks-key-alias loadless \
  --ks-pass pass:VOTRE_MOT_DE_PASSE_STORE \
  --key-pass pass:VOTRE_MOT_DE_PASSE_CLE \
  --out app-release-signed.apk \
  app-release-aligned.apk

# Vérifier
apksigner verify --verbose app-release-signed.apk
```

---

## 7. Vérifications avant distribution

```bash
# Lister les permissions déclarées (doit être minimal)
aapt dump permissions android/app/build/outputs/apk/release/app-release.apk

# Vérifier l'absence de trackers
# Sortie attendue : aucune référence à com.google, com.facebook, com.amazon, com.microsoft
grep -r "com\.google\|com\.facebook\|com\.amazon\|com\.microsoft" android/app/src/
```

---

## 8. Publication F-Droid

Pour soumettre à F-Droid :

1. Le code source doit être dans un repo Git public
2. Créez `metadata/fr.loadless.app.yml` selon le format F-Droid
3. Soumettez via <https://gitlab.com/fdroid/fdroiddata> (merge request)

Pour une distribution directe (sans F-Droid) :
- Hébergez `app-release.apk` sur votre serveur
- Les utilisateurs activent "Sources inconnues" dans les paramètres Android
