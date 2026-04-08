# Regenerates data/sprites-manifest.js from assets/sprites/*.png for the in-browser picker.
$root = Split-Path $PSScriptRoot -Parent
$spriteDir = Join-Path $root "assets\sprites"
$outDir = Join-Path $root "data"
$outFile = Join-Path $outDir "sprites-manifest.js"

if (-not (Test-Path $spriteDir)) {
    Write-Error "Missing folder: $spriteDir"
    exit 1
}
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

$names = Get-ChildItem -Path $spriteDir -Filter "*.png" -File | Sort-Object Name | ForEach-Object { $_.Name }
$json = @($names) | ConvertTo-Json -Compress -Depth 1
$content = "window.__SPRITE_MANIFEST = $json;"
[System.IO.File]::WriteAllText($outFile, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote $($names.Count) entries to $outFile"
