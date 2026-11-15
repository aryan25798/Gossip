#!/usr/bin/env bash
# ==============================================================================
# NovaChat — Cloudflare Pages Staging Deployment Script
# ==============================================================================
set -euo pipefail

PROJECT_NAME="novachat"
BUILD_DIR="dist"
STAGING_BRANCH="staging"

echo "=================================================================="
echo "  NovaChat — Deploying Preview to Staging (Branch: ${STAGING_BRANCH}) "
echo "=================================================================="

# Build application
npm run build

# Deploy with staging branch tag
npx wrangler pages deploy "${BUILD_DIR}" \
    --project-name="${PROJECT_NAME}" \
    --branch="${STAGING_BRANCH}" \
    --commit-dirty=true

echo "✓ Staging deployment uploaded successfully."
