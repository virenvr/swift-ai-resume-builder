# True one-command install for Windows: checks for Node 20+, installs it (and
# wires up PATH) if it's missing, then runs the rest of setup (npm install,
# .env.local, Tectonic). Usage, from a fresh clone:
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1

$root = Split-Path -Parent $PSScriptRoot

function Get-NodeMajor {
  try { return [int]((node -v) -replace '^v(\d+)\..*', '$1') }
  catch { return 0 }
}

function Test-Node20 {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  return (Get-NodeMajor) -ge 20
}

if (Test-Node20) {
  Write-Host "Node $(node -v) found."
} else {
  Write-Host "Node 20+ not found. Installing it via winget..."

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "winget not found. Install Node 20+ yourself from https://nodejs.org, then re-run:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\install.ps1"
    exit 1
  }

  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements

  # Refresh this session's PATH from the machine + user vars winget just updated, so
  # node is usable immediately without reopening the terminal.
  $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"

  if (-not (Test-Node20)) {
    Write-Host "Installed, but this terminal can't see it yet. Close and reopen your terminal, then re-run:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\install.ps1"
    exit 1
  }
  Write-Host "Node $(node -v) installed."
}

node "$root\scripts\setup.mjs"
