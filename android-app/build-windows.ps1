# CoffeeNadu Admin — Windows (JDK 17) APK Build Script
# Package: com.coffeenadu.admin | Launch URL: https://coffeenad-news.ai.studio/admin
# Usage (PowerShell inside android-app\):
#   .\build-windows.ps1 -Target debug
#   .\build-windows.ps1 -Target release
#   .\build-windows.ps1 -Target both

param(
    [ValidateSet("debug", "release", "both")]
    [string]$Target = "both"
)

$ErrorActionPreference = "Stop"

Write-Host "=== CoffeeNadu Admin Android APK Builder (Windows / JDK 17) ===" -ForegroundColor Cyan

# 1. Verify JDK 17+
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    Write-Error "Java (JDK 17) was not found in PATH. Install JDK 17 and set JAVA_HOME."
    exit 1
}
Write-Host "[OK] Java detected:" -ForegroundColor Green
java -version

# 2. Verify Android SDK (ANDROID_HOME or default Windows Android Studio location)
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
    $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $defaultSdk) {
        $env:ANDROID_HOME = $defaultSdk
        Write-Host "[OK] Found Android SDK at $defaultSdk" -ForegroundColor Green
    } else {
        Write-Error "ANDROID_HOME is not set and $defaultSdk was not found. Install Android Studio or Android SDK Command-Line Tools (Platform 35 + Build-Tools 35)."
        exit 1
    }
}

# Ensure local.properties points to Android SDK with escaped Windows slashes
$escapedSdk = $env:ANDROID_HOME.Replace("\", "\\")
Set-Content -Path (Join-Path $PSScriptRoot "local.properties") -Value "sdk.dir=$escapedSdk" -Encoding ASCII

# 3. Locate Gradle (gradlew.bat if present, otherwise system gradle)
$gradleCmd = $null
if (Test-Path (Join-Path $PSScriptRoot "gradlew.bat")) {
    $gradleCmd = Join-Path $PSScriptRoot "gradlew.bat"
} elseif (Get-Command gradle -ErrorAction SilentlyContinue) {
    $gradleCmd = "gradle"
} else {
    Write-Error "Neither gradlew.bat nor 'gradle' found in PATH. Open the android-app folder in Android Studio OR install Gradle 8.7+ (winget install Gradle.Gradle)."
    exit 1
}

Push-Location $PSScriptRoot
try {
    if ($Target -eq "debug" -or $Target -eq "both") {
        Write-Host "`n--- Building Debug APK ---" -ForegroundColor Yellow
        & $gradleCmd assembleDebug
        $debugApk = Join-Path $PSScriptRoot "app\build\outputs\apk\debug\app-debug.apk"
        if (Test-Path $debugApk) {
            Write-Host "[SUCCESS] Debug APK created: $debugApk" -ForegroundColor Green
        }
    }

    if ($Target -eq "release" -or $Target -eq "both") {
        Write-Host "`n--- Building Signed Release APK ---" -ForegroundColor Yellow
        $ksProps = Join-Path $PSScriptRoot "keystore.properties"
        $hasEnvKs = ($env:COFFEENADU_KEYSTORE_PATH -and $env:COFFEENADU_KEYSTORE_PASSWORD -and $env:COFFEENADU_KEY_ALIAS -and $env:COFFEENADU_KEY_PASSWORD)
        if (-not (Test-Path $ksProps) -and -not $hasEnvKs) {
            Write-Error "Missing signing config! Copy keystore.properties.example to keystore.properties (local only, never commit) with your real keystore path, alias, and passwords, then re-run."
            exit 1
        }
        & $gradleCmd assembleRelease
        $releaseApk = Join-Path $PSScriptRoot "app\build\outputs\apk\release\app-release.apk"
        if (Test-Path $releaseApk) {
            Write-Host "[SUCCESS] Signed Release APK created: $releaseApk" -ForegroundColor Green

            # Verify signature with apksigner if available
            $apksigner = Get-ChildItem -Path (Join-Path $env:ANDROID_HOME "build-tools") -Filter "apksigner.bat" -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
            if ($apksigner) {
                Write-Host "`n--- Verifying Release APK Signature ---" -ForegroundColor Cyan
                & $apksigner.FullName verify --print-certs $releaseApk
            }
        }
    }
} finally {
    Pop-Location
}
