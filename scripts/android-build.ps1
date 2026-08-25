param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$localJdkRoot = Join-Path $projectRoot ".tools\jdk21"
$localSdkRoot = Join-Path $projectRoot ".tools\android-sdk"
$jdkDirectory = Get-ChildItem -LiteralPath $localJdkRoot -Directory -ErrorAction SilentlyContinue |
    Select-Object -First 1

if ($jdkDirectory) {
    $env:JAVA_HOME = $jdkDirectory.FullName
}

if (Test-Path -LiteralPath $localSdkRoot) {
    $env:ANDROID_SDK_ROOT = $localSdkRoot
    $escapedSdk = $localSdkRoot.Replace("\", "\\").Replace(":", "\:")
    Set-Content -LiteralPath (Join-Path $projectRoot "android\local.properties") -Value "sdk.dir=$escapedSdk"
}

if (-not $env:JAVA_HOME) {
    throw "JDK 21 não encontrado. Instale o Android Studio ou prepare .tools/jdk21."
}

if (-not $env:ANDROID_SDK_ROOT) {
    throw "Android SDK não encontrado. Instale o SDK 36 ou prepare .tools/android-sdk."
}

Push-Location $projectRoot
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "Falha no build web." }
    & npx cap sync android
    if ($LASTEXITCODE -ne 0) { throw "Falha ao sincronizar o Capacitor." }

    Push-Location (Join-Path $projectRoot "android")
    try {
        & .\gradlew.bat "assemble$Configuration"
        if ($LASTEXITCODE -ne 0) { throw "Falha no build Android $Configuration." }
    } finally {
        Pop-Location
    }
} finally {
    Pop-Location
}
