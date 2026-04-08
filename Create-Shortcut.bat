@echo off
REM Double-click: shortcut on Desktop (correct path on THIS computer).
REM For shortcut inside this folder instead: Create-Shortcut.bat -InFolder
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Create-Shortcut.ps1" %*
echo.
pause
