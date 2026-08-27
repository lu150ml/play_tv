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

    if ($Configuration -eq "Release") {
        $package = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json
        $gradleConfig = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "android\app\build.gradle")
        $versionCodeMatch = [regex]::Match($gradleConfig, 'versionCode\s+(\d+)')
        if (-not $versionCodeMatch.Success) { throw "versionCode Android não encontrado." }

        $artifactDirectory = Join-Path $projectRoot "artifacts"
        $artifactPath = Join-Path $artifactDirectory "play-tv-$($package.version)-release.apk"
        $builtApk = Join-Path $projectRoot "android\app\build\outputs\apk\release\app-release.apk"
        New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
        Copy-Item -LiteralPath $builtApk -Destination $artifactPath -Force

        $manifestPath = Join-Path $projectRoot "android-update.json"
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        $manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
        $manifest.versionCode = [int]$versionCodeMatch.Groups[1].Value
        $manifest.versionName = $package.version
        $manifest.apkUrl = "https://raw.githubusercontent.com/lu150ml/play_tv/codex/android-catalog-search-v1.4.1/artifacts/play-tv-$($package.version)-release.apk"
        $apkStream = [System.IO.File]::OpenRead($artifactPath)
        try {
            $sha256 = [System.Security.Cryptography.SHA256]::Create()
            try {
                $hashBytes = $sha256.ComputeHash($apkStream)
                $manifest.sha256 = [System.BitConverter]::ToString($hashBytes).Replace("-", "")
            } finally {
                $sha256.Dispose()
            }
        } finally {
            $apkStream.Dispose()
        }
        $manifestJson = ($manifest | ConvertTo-Json) + [System.Environment]::NewLine
        [System.IO.File]::WriteAllText($manifestPath, $manifestJson, $utf8NoBom)

        Write-Output "APK publicado localmente em $artifactPath"
        Write-Output "Manifesto Android atualizado em $manifestPath"
    }
} finally {
    Pop-Location
}
