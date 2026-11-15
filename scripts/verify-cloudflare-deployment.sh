#!/usr/bin/env bash
# ==============================================================================
# NovaChat — Cloudflare Pages Deployment Verification Script
# ==============================================================================
set -euo pipefail

DEPLOY_URL="${1:-https://novachat.pages.dev}"

echo "=================================================================="
echo "  NovaChat — Verifying Cloudflare Pages Deployment: ${DEPLOY_URL}  "
echo "=================================================================="

check_route() {
    local route="$1"
    local expected_code="${2:-200}"
    local target="${DEPLOY_URL}${route}"

    echo -n "Checking ${route}... "
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$target" || echo "000")

    if [ "$http_code" == "$expected_code" ]; then
        echo "✓ OK (${http_code})"
    else
        echo "❌ FAILED (Expected: ${expected_code}, Got: ${http_code})"
        return 1
    fi
}

echo "Testing Core SPA Routes:"
check_route "/" 200
check_route "/login" 200
check_route "/admin" 200
check_route "/profile" 200
check_route "/calls" 200
check_route "/status" 200

echo ""
echo "Testing Asset Headers & Manifest:"
check_route "/manifest.webmanifest" 200

echo ""
echo "=================================================================="
echo "  ✓ All Cloudflare Pages Routes Verified Successfully!            "
echo "=================================================================="
