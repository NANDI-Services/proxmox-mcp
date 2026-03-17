$ErrorActionPreference = "Stop"
$configPath = Join-Path (Join-Path (Get-Location) ".nandi-proxmox-mcp") "config.json"

if (!(Test-Path $configPath)) {
  Write-Error "Missing config file at $configPath"
}

$json = Get-Content -Raw $configPath | ConvertFrom-Json
$required = @("proxmoxHost", "proxmoxPort", "proxmoxUser", "proxmoxRealm", "tokenName", "tokenSecret", "sshHost", "sshPort", "sshUser", "sshKeyPath")

$missing = @()
foreach ($key in $required) {
  if (-not $json.PSObject.Properties.Name.Contains($key) -or [string]::IsNullOrWhiteSpace("$($json.$key)")) {
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  Write-Error ("Missing required keys: " + ($missing -join ", "))
}

Write-Host "Config validation: OK"
