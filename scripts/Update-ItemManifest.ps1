# Regenerates data/items-manifest.js from assets/items/*.png for local item icons.
$root = Split-Path $PSScriptRoot -Parent
$itemDir = Join-Path $root "assets\items"
$outDir = Join-Path $root "data"
$outFile = Join-Path $outDir "items-manifest.js"

if (-not (Test-Path $itemDir)) {
    New-Item -ItemType Directory -Path $itemDir | Out-Null
}
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

$names = @()
if (Test-Path $itemDir) {
    $names = Get-ChildItem -Path $itemDir -Filter "*.png" -File | Sort-Object Name | ForEach-Object { $_.Name }
}
$json = @($names) | ConvertTo-Json -Compress -Depth 1
$content = "window.__ITEM_MANIFEST = $json;"
[System.IO.File]::WriteAllText($outFile, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote $($names.Count) entries to $outFile"
