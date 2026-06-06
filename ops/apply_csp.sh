#!/usr/bin/env bash
# Rewrites the nginx Content-Security-Policy (and related security headers) for the game vhost.
# Deployed to /opt/yukon/apply_csp.sh on prod. Run by hand when the CSP needs changing; uses
# interactive sudo (you'll be prompted), so the sudo password is no longer baked into the file.
#
#   ./apply_csp.sh                                   # Report-Only (validation)
#   ./apply_csp.sh Content-Security-Policy           # enforce
set -e
CONF=/etc/nginx/sites-enabled/clubpenguinlive
# header name: Content-Security-Policy-Report-Only (validation) or Content-Security-Policy (enforce)
HEADER="${1:-Content-Security-Policy-Report-Only}"

CSP="default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; font-src 'self' data:; connect-src 'self' blob: wss://clubpenguinlive.net https://challenges.cloudflare.com https://cdn.jsdelivr.net; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'"

sudo cp -n "$CONF" /etc/nginx/cpl-backups/clubpenguinlive.bak-pre-csp 2>/dev/null || true

# drop any existing CSP/header lines we manage, then re-insert
sudo sed -i '/add_header Content-Security-Policy/d; /add_header Referrer-Policy/d; /add_header X-Frame-Options/d' "$CONF"

BLOCK="    add_header ${HEADER} \"${CSP}\" always;\n    add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;\n    add_header X-Frame-Options \"SAMEORIGIN\" always;"
sudo sed -i "s#^\(\s*index index.html;\)#\1\n${BLOCK}#" "$CONF"

echo "=== header lines now ==="
grep -n 'add_header' "$CONF"
sudo nginx -t 2>&1 | tail -2
sudo systemctl reload nginx
echo "CSP applied as: $HEADER"
