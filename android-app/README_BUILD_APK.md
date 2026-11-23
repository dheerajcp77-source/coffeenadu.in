# CoffeeNadu Admin — Windows (JDK 17) Android APK Build & Signing Guide

- **Application Name:** CoffeeNadu Admin
- **Package Name:** `com.coffeenadu.admin`
- **Launch URL:** `https://coffeenad-news.ai.studio/admin`
- **Architecture:** Trusted Web Activity (TWA) with automatic full-screen secure WebView fallback (file/image uploads, Android back navigation, custom splash screen, offline detection & auto-reconnect).
- **Digital Asset Links:** Verified live at `https://coffeenad-news.ai.studio/.well-known/assetlinks.json` for `com.coffeenadu.admin`.
- **Security:** Zero hardcoded admin passwords, API secrets, or keystores. Keep your local keystore and `keystore.properties` strictly on your PC (both are excluded in `.gitignore`).

---

## Prerequisites on Windows 10 / 11
1. **JDK 17** (already installed — verify with `java -version`).
2. **Android Studio** (recommended — bundles Android SDK Platform 35, Build-Tools 35, and Gradle) **OR** Android SDK Command-Line Tools + Gradle 8.7 (`winget install Gradle.Gradle`).

---

## Method 1 — Fastest on Windows: Android Studio (Recommended)
1. Download / copy the `android-app` folder to your Windows PC.
2. Copy `android-app\keystore.properties.example` to `android-app\keystore.properties` and enter your local keystore path (using forward slashes, e.g. `C:/keys/coffeenadu-admin-release.keystore`), alias, and passwords.
3. Open **Android Studio → Open → select the `android-app` folder**.
4. Wait for Gradle Sync to complete (uses JDK 17 + Android SDK 35).
5. Build **Debug APK:** `Build → Build Bundle(s) / APK(s) → Build APK(s)`
   - Output: `android-app\app\build\outputs\apk\debug\app-debug.apk`
6. Build **Signed Release APK:** Open Android Studio's **Terminal** tab and run:
   ```powershell
   .\build-windows.ps1 -Target release
   ```
   - Output: `android-app\app\build\outputs\apk\release\app-release.apk`

---

## Method 2 — Windows PowerShell Command Line (Debug + Signed Release)

Open **PowerShell** inside the `android-app` folder:

### Step 1: Verify JDK 17 & Your Local Keystore Fingerprint
Confirm your local keystore SHA-256 matches the live production fingerprint on `https://coffeenad-news.ai.studio/.well-known/assetlinks.json`:
```powershell
keytool -list -v -keystore "C:\path\to\your-release.keystore" -alias "your-alias" | Select-String "SHA256"
```
Check live Digital Asset Links:
```powershell
Invoke-RestMethod "https://coffeenad-news.ai.studio/.well-known/assetlinks.json" | ConvertTo-Json -Depth 5
```

### Step 2: Configure Local Signing (`android-app\keystore.properties`)
Copy `keystore.properties.example` to `keystore.properties` (never commit or upload this file):
```properties
storeFile=C:/path/to/your-release.keystore
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=YOUR_KEY_ALIAS
keyPassword=YOUR_KEY_PASSWORD
```

### Step 3: Build Both APKs via PowerShell Script
```powershell
# Build Debug APK only:
.\build-windows.ps1 -Target debug

# Build Signed Release APK only (and auto-verify with apksigner):
.\build-windows.ps1 -Target release

# Build BOTH Debug and Signed Release APKs:
.\build-windows.ps1 -Target both
```

Output binaries:
- **Debug APK:** `android-app\app\build\outputs\apk\debug\app-debug.apk`
- **Signed Release APK:** `android-app\app\build\outputs\apk\release\app-release.apk`

---

## Method 3 — Bubblewrap CLI on Windows (Optional TWA Alternative)
```powershell
npm install -g @bubblewrap/cli
cd android-app
bubblewrap update
bubblewrap build
```
*(Uses `android-app\twa-manifest.json`, already synced with `https://coffeenad-news.ai.studio/manifest.webmanifest` and your production SHA-256 fingerprint.)*

---

## Installing & Testing on Your Android Phone
1. Transfer `app-release.apk` (recommended — matches `com.coffeenadu.admin` + Digital Asset Links for full-screen chrome-less TWA mode) to your Android phone, or install via USB:
   ```powershell
   adb install -r app\build\outputs\apk\release\app-release.apk
   ```
2. Open **CoffeeNadu Admin**:
   - Confirm splash screen + full-screen view with no browser URL bar.
   - Sign in using your existing Admin 2.0 credentials (Google Auth or RBAC Email/Password).
   - Test creating/editing an article, uploading main + extra photos, Android back button navigation, and signing out.
