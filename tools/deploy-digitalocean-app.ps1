param(
  [string]$AppId = "9caabc0b-97b7-4654-be66-ef5e737dc171",
  [string]$RepoCloneUrl = "https://github.com/Aleph-000/Aleph-000.github.io.git",
  [string]$Branch = "main",
  [string]$Region = "sgp",
  [string]$StaticSiteUrl = "https://aleph-null.cc",
  [string]$GitHubPagesUrl = "https://aleph-000.github.io",
  [string]$OwnerUsername = "Aleph_null",
  [string]$InstanceSizeSlug = "basic-xxs",
  [string]$SecretKey = $env:SECRET_KEY,
  [string]$OwnerSetupKey = $env:OWNER_SETUP_KEY,
  [string]$DigitalOceanToken = $env:DIGITALOCEAN_API_TOKEN,
  [switch]$ProposeOnly
)

$ErrorActionPreference = "Stop"

if (-not $DigitalOceanToken) {
  $DigitalOceanToken = [Environment]::GetEnvironmentVariable("DIGITALOCEAN_API_TOKEN", "User")
}

if (-not $DigitalOceanToken) {
  throw "DIGITALOCEAN_API_TOKEN is missing. Set it in the current shell or Windows user environment."
}

if (-not $SecretKey -or $SecretKey.Length -lt 32) {
  throw "SECRET_KEY is missing or too short. Provide a long random value via -SecretKey or env:SECRET_KEY."
}

if (-not $OwnerSetupKey -or $OwnerSetupKey.Length -lt 12) {
  throw "OWNER_SETUP_KEY is missing or too short. Provide it via -OwnerSetupKey or env:OWNER_SETUP_KEY."
}

$corsOrigins = "$GitHubPagesUrl,$StaticSiteUrl"

$spec = [ordered]@{
  name = "aleph-null-blog"
  region = $Region
  static_sites = @(
    [ordered]@{
      name = "web"
      git = [ordered]@{
        repo_clone_url = $RepoCloneUrl
        branch = $Branch
      }
      source_dir = "/do-static"
      environment_slug = "html"
      output_dir = "/"
      index_document = "index.html"
      catchall_document = "index.html"
    }
  )
  services = @(
    [ordered]@{
      name = "api"
      git = [ordered]@{
        repo_clone_url = $RepoCloneUrl
        branch = $Branch
      }
      source_dir = "/"
      dockerfile_path = "api/Dockerfile"
      http_port = 8000
      instance_count = 1
      instance_size_slug = $InstanceSizeSlug
      envs = @(
        [ordered]@{ key = "DATABASE_URL"; scope = "RUN_TIME"; value = '${blog-db.DATABASE_URL}' }
        [ordered]@{ key = "SECRET_KEY"; scope = "RUN_TIME"; type = "SECRET"; value = $SecretKey }
        [ordered]@{ key = "OWNER_USERNAME"; scope = "RUN_TIME"; value = $OwnerUsername }
        [ordered]@{ key = "OWNER_SETUP_KEY"; scope = "RUN_TIME"; type = "SECRET"; value = $OwnerSetupKey }
        [ordered]@{ key = "CORS_ORIGINS"; scope = "RUN_TIME"; value = $corsOrigins }
        [ordered]@{ key = "ACCESS_TOKEN_MINUTES"; scope = "RUN_TIME"; value = "10080" }
      )
    }
  )
  databases = @(
    [ordered]@{
      name = "blog-db"
      engine = "PG"
      version = "16"
      production = $false
    }
  )
  ingress = [ordered]@{
    rules = @(
      [ordered]@{
        match = [ordered]@{ path = [ordered]@{ prefix = "/api" } }
        component = [ordered]@{ name = "api" }
      }
      [ordered]@{
        match = [ordered]@{ path = [ordered]@{ prefix = "/" } }
        component = [ordered]@{ name = "web" }
      }
    )
  }
}

$body = @{ spec = $spec } | ConvertTo-Json -Depth 100
$headers = @{
  Authorization = "Bearer $DigitalOceanToken"
  "Content-Type" = "application/json"
}

if ($ProposeOnly) {
  $result = Invoke-RestMethod -Method Post -Uri "https://api.digitalocean.com/v2/apps/propose" -Headers $headers -Body $body
  $result | ConvertTo-Json -Depth 100
  return
}

$result = Invoke-RestMethod -Method Put -Uri "https://api.digitalocean.com/v2/apps/$AppId" -Headers $headers -Body $body
$agentDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path ".agent"
if (Test-Path -LiteralPath $agentDir) {
  $result | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath (Join-Path $agentDir "do-last-deploy.json") -Encoding UTF8
}
$result | ConvertTo-Json -Depth 20
