$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Push-Location $root
try {
  python -m pytest api\tests -q
  powershell -ExecutionPolicy Bypass -File tools\sync-static.ps1
}
finally {
  Pop-Location
}
