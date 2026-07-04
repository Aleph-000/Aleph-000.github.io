$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$public = Join-Path $root "public"

function Remove-InWorkspace($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  $resolved = (Resolve-Path -LiteralPath $Path).Path
  if (-not $resolved.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove path outside workspace: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

function Copy-PublicTo($Target) {
  Remove-InWorkspace $Target
  New-Item -ItemType Directory -Path $Target | Out-Null
  Get-ChildItem -LiteralPath $public -Force | Copy-Item -Destination $Target -Recurse -Force
  New-Item -ItemType File -Path (Join-Path $Target ".nojekyll") -Force | Out-Null
}

function Sync-RootStatic() {
  $generatedItems = @(
    "2026",
    "about",
    "archives",
    "assets",
    "categories",
    "css",
    "fontawesome",
    "fonts",
    "images",
    "js",
    "projects",
    "tags",
    "webfonts",
    "404.html",
    "index.html",
    "search.xml",
    ".nojekyll"
  )

  foreach ($item in $generatedItems) {
    Remove-InWorkspace (Join-Path $root $item)
  }

  Get-ChildItem -LiteralPath $public -Force | Copy-Item -Destination $root -Recurse -Force
  New-Item -ItemType File -Path (Join-Path $root ".nojekyll") -Force | Out-Null
}

Push-Location $root
try {
  pnpm clean
  pnpm build

  if (-not (Test-Path -LiteralPath $public)) {
    throw "Hexo build did not create public/"
  }

  Copy-PublicTo (Join-Path $root "do-static")
  Sync-RootStatic
  Write-Host "Synced Hexo output to do-static/ and repository root."
}
finally {
  Pop-Location
}
