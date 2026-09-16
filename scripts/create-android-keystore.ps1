$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$jdkRoot = Join-Path $projectRoot ".tools\jdk21"
$jdkDirectory = Get-ChildItem -LiteralPath $jdkRoot -Directory -ErrorAction SilentlyContinue |
    Select-Object -First 1

if (-not $jdkDirectory) {
    throw "JDK 21 local não encontrado em .tools/jdk21."
}

$keytool = Join-Path $jdkDirectory.FullName "bin\keytool.exe"
$keystorePath = Join-Path $projectRoot ".tools\play-tv-release.jks"
$propertiesPath = Join-Path $projectRoot "android\keystore.properties"

if ((Test-Path -LiteralPath $keystorePath) -and (Test-Path -LiteralPath $propertiesPath)) {
    Write-Output "A chave release do Play TV já existe."
    exit 0
}

$passwordBytes = New-Object byte[] 32
$randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$randomGenerator.GetBytes($passwordBytes)
$randomGenerator.Dispose()
$signingPassword = [Convert]::ToBase64String($passwordBytes).Replace("/", "_").Replace("+", "-")

& $keytool -genkeypair -v `
    -keystore $keystorePath `
    -storepass $signingPassword `
    -keypass $signingPassword `
    -alias "play-tv" `
    -keyalg RSA `
    -keysize 4096 `
    -validity 10000 `
    -dname "CN=Play TV, OU=Mobile, O=Play TV, L=Sao Paulo, ST=SP, C=BR"

if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível criar a chave de assinatura."
}

$escapedPath = $keystorePath.Replace("\", "\\").Replace(":", "\:")
$properties = @(
    "storeFile=$escapedPath"
    "storePassword=$signingPassword"
    "keyAlias=play-tv"
    "keyPassword=$signingPassword"
)
Set-Content -LiteralPath $propertiesPath -Value $properties
Write-Output "Chave release criada. Faça backup de .tools/play-tv-release.jks e android/keystore.properties."
