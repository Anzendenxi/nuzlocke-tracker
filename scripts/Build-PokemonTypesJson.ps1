# Builds data/pokemon-types.json from pokeapi.co (list + batched parallel curl + regex).
$ErrorActionPreference = "Stop"
$outDir = Join-Path (Split-Path $PSScriptRoot -Parent) "data"
$outFile = Join-Path $outDir "pokemon-types.json"
$outJs = Join-Path $outDir "pokemon-types.js"
$batchSize = 10
$curl = "$env:SystemRoot\System32\curl.exe"

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

Write-Host "Fetching pokemon list..."
$list = (Invoke-RestMethod -Uri "https://pokeapi.co/api/v2/pokemon?limit=2000" -TimeoutSec 120).results
Write-Host "Got $($list.Count) entries; fetching details in batches of $batchSize..."

function Parse-Detail([string]$raw, [string]$url) {
  if ($raw -notmatch '"types"\s*:\s*\[') { return $null }
  if ($raw -notmatch '"name"\s*:\s*"([a-z0-9-]+)"\s*,\s*"order"\s*:') { return $null }
  $name = $Matches[1]
  $idx = $raw.IndexOf('"types"')
  if ($idx -lt 0) { return $null }
  $slice = $raw.Substring($idx, [Math]::Min(900, $raw.Length - $idx))
  $typeMatches = [regex]::Matches($slice, '"slot"\s*:\s*(\d+)\s*,\s*"type"\s*:\s*\{\s*"name"\s*:\s*"([a-z]+)"')
  $pairs = @()
  foreach ($m in $typeMatches) {
    $pairs += [PSCustomObject]@{ Slot = [int]$m.Groups[1].Value; T = $m.Groups[2].Value }
  }
  $types = @($pairs | Sort-Object Slot | ForEach-Object { $_.T })
  if ($types.Count -eq 0) { return $null }
  $id = 0
  if ($url -match "pokemon/(\d+)/") { $id = [int]$Matches[1] }
  return [PSCustomObject]@{ id = $id; name = $name; types = $types }
}

$byName = [ordered]@{}
$byId = [ordered]@{}
$n = 0

for ($i = 0; $i -lt $list.Count; $i += $batchSize) {
  $slice = $list[$i..([Math]::Min($i + $batchSize - 1, $list.Count - 1))]
  $jobs = @()
  foreach ($item in $slice) {
    $u = $item.url
    $jobs += Start-Job -ScriptBlock {
      param($curlExe, $u)
      $raw = & $curlExe -sS --max-time 120 $u 2>$null
      if ($LASTEXITCODE -ne 0) { return @{ ok = $false; u = $u; raw = "" } }
      return @{ ok = $true; u = $u; raw = $raw }
    } -ArgumentList $curl, $u
  }
  $jobs | Wait-Job | Out-Null
  foreach ($j in $jobs) {
    $r = Receive-Job $j
    Remove-Job $j
    if (-not $r.ok) { continue }
    $p = Parse-Detail $r.raw $r.u
    if ($null -eq $p) { continue }
    if (-not $byName.Contains($p.name)) { $byName[$p.name] = $p.types }
    if ($p.id -gt 0) { $byId["$($p.id)"] = @{ name = $p.name; types = $p.types } }
    $n++
  }
  Write-Host "  $n / $($list.Count)"
}

$payload = [ordered]@{
  source  = "https://pokeapi.co/api/v2/"
  license = "PokeAPI CC BY-NC-SA 4.0 see https://pokeapi.co/docs/v2#info"
  byName  = [hashtable]$byName
  byId    = [hashtable]$byId
}
$json = $payload | ConvertTo-Json -Depth 8 -Compress
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))
$jsBundle = "window.__POKEMON_TYPES = " + $json + ";"
[System.IO.File]::WriteAllText($outJs, $jsBundle, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done: $($byName.Count) species -> $outFile and $outJs"
