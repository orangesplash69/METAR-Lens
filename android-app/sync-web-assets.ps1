param(
    [string]$SourceRoot = ".."
)

$ErrorActionPreference = "Stop"

$sourcePath = Resolve-Path (Join-Path $PSScriptRoot $SourceRoot)
$targetPath = Resolve-Path (Join-Path $PSScriptRoot "app/src/main/assets/www")

Copy-Item (Join-Path $sourcePath "index.html") (Join-Path $targetPath "index.html") -Force
Copy-Item (Join-Path $sourcePath "style.css") (Join-Path $targetPath "style.css") -Force
Copy-Item (Join-Path $sourcePath "app.js") (Join-Path $targetPath "app.js") -Force

Write-Host "Synced web assets to $targetPath"