#!/usr/bin/env bash
# Smoke test runner: opens SSH tunnel to prod nginx, runs login test, tears down.
# Works non-interactively from the Claude Code Bash tool on dev-01 (Windows/Git Bash).
set -euo pipefail

TUNNEL_PORT=18082
TUNNEL_PID=""

cleanup() {
    if [ -n "$TUNNEL_PID" ]; then
        kill "$TUNNEL_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# Kill any stale listener on the port before opening a new one.
# taskkill output goes to /dev/null; ignore errors (nothing may be there).
cmd.exe /c "for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :${TUNNEL_PORT}') do taskkill /PID %a /F" >/dev/null 2>&1 || true
sleep 1

# Open the tunnel in the background.
ssh -o StrictHostKeyChecking=no -o BatchMode=yes \
    -N -L "127.0.0.1:${TUNNEL_PORT}:172.18.0.5:8080" cpl-prod &
TUNNEL_PID=$!

# Wait for the tunnel port to accept connections (up to 10 s).
for i in $(seq 10); do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${TUNNEL_PORT}/" 2>/dev/null || true)
    if [ "$CODE" = "200" ] || [ "$CODE" = "301" ] || [ "$CODE" = "302" ]; then
        break
    fi
    sleep 1
done

SMOKE_HOST="http://localhost:${TUNNEL_PORT}" \
    node "$(dirname "$0")/smoke_login.js"
