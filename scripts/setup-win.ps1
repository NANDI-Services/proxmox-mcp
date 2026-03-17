param(
  [string]$PackageName = "nandi-proxmox-mcp"
)

$ErrorActionPreference = "Stop"
Write-Host "Installing $PackageName globally..."
npm install -g $PackageName

Write-Host "Running setup wizard..."
& $PackageName setup

Write-Host "Running doctor checks..."
& $PackageName doctor --check nodes,vms,cts,node-status,remote-op

