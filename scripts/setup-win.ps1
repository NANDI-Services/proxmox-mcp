param(
  [string]$PackageName = "nandi-proxmox-mcp",
  [Parameter(Mandatory = $true)][string]$ProxmoxHost,
  [Parameter(Mandatory = $true)][string]$ProxmoxUser,
  [Parameter(Mandatory = $true)][string]$TokenName,
  [Parameter(Mandatory = $true)][string]$TokenSecret,
  [string]$ProxmoxRealm = "pve",
  [int]$ProxmoxPort = 8006,
  [switch]$AllowInsecureTls,
  [string]$SshHost,
  [int]$SshPort = 22,
  [string]$SshUser = "root",
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\id_ed25519",
  [switch]$SkipConnectivity,
  [string]$DoctorChecks = "mcp-config,nodes,vms,cts,node-status,remote-op",
  [int]$DoctorCtid = 0
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SshHost)) {
  $SshHost = $ProxmoxHost
}

Write-Host "Installing $PackageName globally..."
npm install -g $PackageName

$setupArgs = @(
  "setup",
  "--proxmox-host", $ProxmoxHost,
  "--proxmox-port", $ProxmoxPort,
  "--proxmox-user", $ProxmoxUser,
  "--proxmox-realm", $ProxmoxRealm,
  "--token-name", $TokenName,
  "--token-secret", $TokenSecret,
  "--ssh-host", $SshHost,
  "--ssh-port", $SshPort,
  "--ssh-user", $SshUser,
  "--ssh-key-path", $SshKeyPath
)

if ($AllowInsecureTls) {
  $setupArgs += "--allow-insecure-tls"
}

if ($SkipConnectivity) {
  $setupArgs += "--skip-connectivity"
}

Write-Host "Running setup..."
& $PackageName @setupArgs

$doctorArgs = @(
  "doctor",
  "--check", $DoctorChecks
)

if ($DoctorCtid -gt 0) {
  $doctorArgs += @("--ctid", $DoctorCtid)
}

Write-Host "Running doctor checks..."
& $PackageName @doctorArgs
