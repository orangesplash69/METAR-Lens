# METAR Lens Android Wrapper

This Android Studio project wraps the existing web app (`index.html`, `style.css`, `app.js`) inside a native Android `WebView`.

## What is included

- Full-screen native Android app (`WebView`) with no browser chrome
- Splash screen (`Theme.SplashScreen`) and launcher icon
- Offline fallback page (`offline.html`) when the main web view cannot load network content
- Bundled website assets under `app/src/main/assets/www`
- Optional release signing config via `keystore.properties`

## Project structure

- `app/src/main/java/com/orangesplash/metarlens/MainActivity.kt`: WebView host activity
- `app/src/main/assets/www/`: your website files
- `app/src/main/assets/offline.html`: offline fallback screen
- `app/src/main/res/`: icon, splash, themes, layout

## Requirements

- Android Studio (Hedgehog or newer)
- Android SDK Platform 35 installed
- JDK 17 or JDK 21 (recommended; set Gradle JDK in Android Studio to one of these)

## Sync updated web assets

If you change root web files, re-copy them into Android assets:

```powershell
cd android-app
./sync-web-assets.ps1
```

## Build debug APK

```powershell
cd android-app
./gradlew.bat assembleDebug
```

Output:

- `app/build/outputs/apk/debug/app-debug.apk`

## Generate signed release APK

1. Create a keystore (one time):

```powershell
keytool -genkeypair -v -keystore keystore\metarlens-release.jks -alias metarlens -keyalg RSA -keysize 2048 -validity 10000
```

2. Copy template and fill secrets:

```powershell
copy keystore.properties.example keystore.properties
```

`keystore.properties` values:

- `storeFile=../keystore/metarlens-release.jks`
- `storePassword=...`
- `keyAlias=metarlens`
- `keyPassword=...`

3. Build release APK:

```powershell
./gradlew.bat clean assembleRelease
```

Output:

- `app/build/outputs/apk/release/app-release.apk`

## Install on device

Enable Developer Options + USB Debugging, then:

```powershell
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

For release APK:

```powershell
adb install -r app\build\outputs\apk\release\app-release.apk
```

## Test on emulator

1. Open Android Studio Device Manager.
2. Start an emulator (API 30+ recommended).
3. Run:

```powershell
./gradlew.bat installDebug
```

or click **Run** in Android Studio.

## Notes

- The UI is always available offline because assets are bundled in the APK.
- Live METAR/TAF/API calls still require internet access.
- If no `keystore.properties` exists, release builds fall back to debug signing for convenience; provide keystore properties for production signing.
- If your machine defaults to JDK 25+, point Gradle to JDK 17/21 in Android Studio settings.
