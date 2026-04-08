# Creates a Windows shortcut to index.html with assets\shortcut-icon.ico.
# Default: shortcut on the user's Desktop (paths are built for *this* PC when you run it).
# Use -InFolder to place "Nuzlocke Tracker.lnk" inside the project folder instead.
param(
    [switch]$InFolder
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$index = Join-Path $root "index.html"
$icon = Join-Path $root "assets\shortcut-icon.ico"

if (-not (Test-Path -LiteralPath $index)) {
    Write-Error "index.html not found next to this script."
    exit 1
}

$shortcutPath = if ($InFolder) {
    Join-Path $root "Nuzlocke Tracker.lnk"
} else {
    Join-Path ([Environment]::GetFolderPath("Desktop")) "Nuzlocke Tracker.lnk"
}

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($shortcutPath)
$sc.TargetPath = $index
$sc.WorkingDirectory = $root
$sc.Description = "Nuzlocke Tracker"
if (Test-Path -LiteralPath $icon) {
    $sc.IconLocation = "$icon,0"
} else {
    Write-Warning "Icon not found: $icon (shortcut created with default icon)."
}
$sc.Save()

Write-Host "Shortcut created: $shortcutPath"
