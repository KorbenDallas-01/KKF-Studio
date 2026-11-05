
# Folder projektu - aktualna lokalizacja PowerShell
$source = (Get-Location).Path

# Archiwum ZIP zostanie zapisane na pulpicie
$desktop = [Environment]::GetFolderPath("Desktop")
$zipPath = Join-Path $desktop "FiszkaStudio_KOD_ZRODLOWY.zip"

# Foldery pomijane podczas pakowania
$excludedDirs = @(
    "node_modules",
    "target",
    "dist",
    "build",
    "bin",
    "obj",
    ".git",
    ".vs",
    ".vite",
    "coverage"
)

# Rozszerzenia plikow kompilacji
$excludedExtensions = @(
    ".exe", ".msi", ".msix", ".dll",
    ".pdb", ".ilk", ".obj", ".o",
    ".rlib", ".rmeta", ".tmp"
)

Add-Type -AssemblyName System.IO.Compression

if (-not (Test-Path (Join-Path $source "package.json")) -or
    -not (Test-Path (Join-Path $source "src-tauri"))) {
    throw "Uruchom skrypt w folderze glownym projektu (package.json i src-tauri)."
}

if (Test-Path $zipPath) {
    throw "Archiwum juz istnieje: $zipPath. Zmien jego nazwe lub przenies je."
}

$files = Get-ChildItem -LiteralPath $source -File -Recurse -Force |
    Where-Object {
        $relative = $_.FullName.Substring($source.Length).TrimStart('\')
        $parts = $relative -split '[\\/]'

        $skipDir = @($parts | Where-Object {
            $excludedDirs -contains $_
        }).Count -gt 0

        $skipExt = $excludedExtensions -contains $_.Extension.ToLowerInvariant()

        $skipSecret = $_.Name -eq ".env" -or
            $_.Name -like ".env.*" -or
            $_.Extension -in @(".pfx", ".p12", ".pem", ".key")

        -not ($skipDir -or $skipExt -or $skipSecret)
    }

$zip = [System.IO.Compression.ZipFile]::Open(
    $zipPath,
    [System.IO.Compression.ZipArchiveMode]::Create
)

try {
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($source.Length).TrimStart('\')

        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip,
            $file.FullName,
            ($relative -replace '\\', '/'),
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $zip.Dispose()
}

$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)

Write-Host ""
Write-Host "GOTOWE!" -ForegroundColor Green
Write-Host "Plik: $zipPath"
Write-Host "Rozmiar: $sizeMB MB"
Write-Host "Spakowano plikow: $($files.Count)"
Test-Path C:\Users\IBE\Desktop\FiszkaStudio_KOD_ZRODLOWY.zip