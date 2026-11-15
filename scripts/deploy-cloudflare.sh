#!/usr/bin/env bash
# ==============================================================================
# NovaChat — Cloudflare Pages CLI Deployment Script
# ==============================================================================
set -euo pipefail

PROJECT_NAME="novachat"
BUILD_DIR="dist"

echo "=================================================================="
echo "  NovaChat — Deploying Frontend to Cloudflare Pages (CLI)        "
echo "=================================================================="

# 1. Environment and Prerequisites Check
echo "Step 1: Validating environment and build tools..."
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is required but not installed."
    exit 1
fi

if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx is required."
    exit 1
fi

# 2. Dependency Verification
echo "Step 2: Checking project dependencies..."
if [ ! -d "node_modules" ]; then
    echo "Installing project dependencies via npm ci..."
    npm ci
fi

# 3. Production Build Execution
echo "Step 3: Compiling production build (Vite)..."
npm run build

# 4. Build Artifact Validation
echo "Step 4: Validating generated build artifacts..."
if [ ! -f "${BUILD_DIR}/index.html" ]; then
    echo "❌ Error: ${BUILD_DIR}/index.html missing. Build failed."
    exit 1
fi

if [ ! -f "${BUILD_DIR}/_redirects" ]; then
    echo "Warning: _redirects missing in build. Copying from public/_redirects..."
    cp public/_redirects "${BUILD_DIR}/_redirects"
fi

echo "✓ Build verified: $(du -sh ${BUILD_DIR} | cut -f1) generated."

# 5. Cloudflare Pages Deployment via Wrangler CLI
echo "Step 5: Uploading assets to Cloudflare Pages via Wrangler..."
npx wrangler pages deploy "${BUILD_DIR}" --project-name="${PROJECT_NAME}" --commit-dirty=true

echo "=================================================================="
echo "  ✓ NovaChat Cloudflare Pages Deployment Complete!                "
echo "=================================================================="
