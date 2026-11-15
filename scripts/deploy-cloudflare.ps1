# ==============================================================================
# NovaChat — Cloudflare Pages CLI Deployment Script (PowerShell / Windows)
# ==============================================================================
param(
    [string]$ProjectName = "novachat",
    [string]$Branch = "main",
    [string]$BuildDir = "dist"
)

$ErrorActionPreference = "Stop"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  NovaChat — Deploying Frontend to Cloudflare Pages (CLI)        " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Build Verification
Write-Host "Step 1: Compiling production build with Vite..." -ForegroundColor Yellow
npm run build

# 2. Check artifacts
if (-not (Test-Path "$BuildDir/index.html")) {
    Write-Error "Build output $BuildDir/index.html not found. Deployment aborted."
}

if (-not (Test-Path "$BuildDir/_redirects")) {
    Write-Host "Copying public/_redirects to $BuildDir..." -ForegroundColor Yellow
    Copy-Item "public/_redirects" "$BuildDir/_redirects"
}

# 3. Wrangler Deployment
Write-Host "Step 2: Deploying to Cloudflare Pages via Wrangler..." -ForegroundColor Yellow
npx wrangler pages deploy "$BuildDir" --project-name="$ProjectName" --branch="$Branch" --commit-dirty=true

Write-Host "==================================================================" -ForegroundColor Green
Write-Host "  ✓ Cloudflare Pages Deployment Succeeded!                       " -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
