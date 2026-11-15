#!/usr/bin/env bash
# ==============================================================================
# NovaChat — Cloudflare Pages Production Deployment Script
# ==============================================================================
set -euo pipefail

PROJECT_NAME="novachat"
BUILD_DIR="dist"
PROD_BRANCH="main"

echo "=================================================================="
echo "  NovaChat — Deploying Production Build (Branch: ${PROD_BRANCH})  "
echo "=================================================================="

# 1. Safety Check: Verify on main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [ "$CURRENT_BRANCH" != "$PROD_BRANCH" ]; then
    echo "⚠️ Warning: You are currently on branch '${CURRENT_BRANCH}', not '${PROD_BRANCH}'."
    read -p "Are you sure you want to deploy this branch to PRODUCTION? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment aborted."
        exit 1
    fi
fi

# 2. Compile Production Build
echo "Step 1: Building optimized production bundle..."
npm run build

# 3. Deploy to Cloudflare Pages Production
echo "Step 2: Publishing to Cloudflare Pages production..."
npx wrangler pages deploy "${BUILD_DIR}" \
    --project-name="${PROJECT_NAME}" \
    --branch="${PROD_BRANCH}" \
    --commit-dirty=true

echo "✓ Production deployment completed successfully."
