#!/usr/bin/env bash
# Load-bearing client rebuild. Deployed to /opt/yukon/recover_rebuild.sh on prod.
#
# `npm run build` in the client does `rimraf dist` first, so the static assets (branding, PWA
# icons, the piefruit media/font symlinks, styles, lib scripts) must be re-laid every build. NEVER
# run the bare client `npm run build` on prod: it wipes dist and leaves the site without those
# assets until this script restores them. Always run THIS.
set -e

echo "=== ensure swap (prevents OOM hang) ==="
if ! swapon --show 2>/dev/null | grep -q '/swapfile'; then
  # best-effort, non-interactive. Needs a NOPASSWD sudoers rule for the swap commands, or a
  # one-time manual setup. Swap already present on the box, so this normally no-ops.
  sudo -n bash -c 'fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && (grep -q "/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab)' \
    || echo "WARN: could not ensure swap automatically (no passwordless sudo); set it up once by hand if a build OOMs."
fi
free -h | grep -iE 'swap|mem'

echo "=== rebuild client, capped node memory ==="
cd /opt/yukon/client
NODE_OPTIONS=--max-old-space-size=1024 npm run build 2>&1 | tail -4
ln -sfn /opt/yukon/piefruit-assets/media dist/assets/media
ln -sfn /opt/yukon/piefruit-assets/fonts dist/assets/fonts
cp -r assets/styles dist/assets/styles
cp -r assets/scripts/lib dist/assets/scripts/lib
ln -sfn /opt/yukon/client/create dist/create
ln -sfn /opt/yukon/client/pages dist/pages
ln -sfn /opt/yukon/client/account dist/account
ln -sfn /opt/yukon/minigames dist/minigames
# static branding + PWA assets (dist is wiped each build)
cp /opt/yukon/client/branding/favicon* dist/ 2>/dev/null || true
cp /opt/yukon/client/branding/manifest.json dist/ 2>/dev/null || true
cp /opt/yukon/client/branding/sw.js dist/ 2>/dev/null || true
cp -r /opt/yukon/client/branding/icons dist/icons 2>/dev/null || true

echo "=== verify ==="
grep -c 'cpl-stage' dist/index.html && echo "CP-BLUE CHROME PRESENT" || echo "chrome MISSING"
grep -c 'cpl-rotate' dist/index.html && echo "MOBILE ROTATE OVERLAY PRESENT" || echo "rotate overlay MISSING"
echo RECOVER_REBUILD_DONE
