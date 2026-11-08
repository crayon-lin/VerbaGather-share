$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

Write-Host ''
Write-Host '  Inkling - CET-4 / CET-6 study site' -ForegroundColor Green
Write-Host '  =================================' -ForegroundColor DarkGray

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '  Node.js 22.13+ is required. Install it from https://nodejs.org and retry.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit 1
}

$nodeVersion = (& node -v).TrimStart('v')
$major = [int]($nodeVersion.Split('.')[0])
if ($major -lt 22) {
  Write-Host "  Node.js $nodeVersion is too old. Please install 22.13 or newer." -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit 1
}

if (-not (Test-Path 'node_modules')) {
  Write-Host '  Installing dependencies (first run)...' -ForegroundColor Cyan
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  npm install failed. Retrying without lifecycle scripts...' -ForegroundColor Yellow
    npm install --ignore-scripts
    if ($LASTEXITCODE -ne 0) {
      Write-Host '  Could not install dependencies. Check your network and Node.js installation.' -ForegroundColor Red
      Read-Host 'Press Enter to exit'
      exit 1
    }
  }
}

if (-not (Test-Path 'dist\index.html')) {
  Write-Host '  Building the site (first run)...' -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) {
    Read-Host 'Build failed. Press Enter to exit'
    exit 1
  }
}

Write-Host '  Opening http://127.0.0.1:5178 ...' -ForegroundColor Cyan
Start-Job -ScriptBlock {
  Start-Sleep -Seconds 2
  Start-Process 'http://127.0.0.1:5178'
} | Out-Null
Write-Host '  Press Ctrl+C to stop the server.' -ForegroundColor DarkGray
Write-Host ''

npm start
