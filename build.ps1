$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (!(Test-Path 'package.json') -or !(Test-Path 'src-tauri/tauri.conf.json')) { throw 'Place these scripts next to package.json in KKFStudio.' }
foreach ($name in @('node','npm','cargo','dotnet')) {
  if (!(Get-Command $name -ErrorAction SilentlyContinue)) { throw "Missing tool: $name" }
}
Write-Host '1/3 Publishing .NET helper...'
dotnet publish '.\helper\KKF.Helper.csproj' -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o '.\helper\publish'
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }
Write-Host '2/3 Installing JavaScript dependencies...'
if (Test-Path 'package-lock.json') { npm ci } else { npm install }
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
Write-Host '3/3 Building Windows NSIS installer...'
npx --no-install tauri build --bundles nsis
if ($LASTEXITCODE -ne 0) { throw 'tauri build failed' }
Write-Host 'Done. Installer directory: src-tauri\target\release\bundle\nsis' -ForegroundColor Green
