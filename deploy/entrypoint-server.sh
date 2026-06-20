#!/bin/sh
# Render config/config.json from env (single .env is the source of truth, decision 8), then run
# the requested mode. Empty RESEND_API_KEY leaves smtp.pass empty -> EmailManager scaffold mode
# (logs codes), which is the safe default until the key is set.
set -e

mkdir -p /app/config
cat > /app/config/config.json <<EOF
{
  "crypto": { "secret": "${CRYPTO_SECRET}", "rounds": ${BCRYPT_ROUNDS:-10}, "loginKeyExpiry": ${LOGIN_KEY_EXPIRY:-300} },
  "database": { "host": "${DB_HOST:-mariadb}", "user": "${DB_USER:-yukon}", "password": "${DB_PASSWORD}", "database": "${DB_NAME:-clubpenguinlive}", "dialect": "mysql", "debug": false, "logQueryParameters": false },
  "socketio": { "https": false },
  "cors": { "origin": "${CORS_ORIGIN:-https://play.clubpenguinlive.net}" },
  "rateLimit": { "enabled": true, "addressConnectsPerSecond": 5, "addressEventsPerSecond": 50, "userEventsPerSecond": 10, "ipAddressHeader": false },
  "worlds": {
    "Login": { "host": "0.0.0.0", "port": 6111 },
    "Blizzard": { "host": "0.0.0.0", "port": 6112, "maxUsers": ${BLIZZARD_MAX_USERS:-300} },
    "Iceberg": { "host": "0.0.0.0", "port": 6113, "maxUsers": ${BLIZZARD2_MAX_USERS:-300} }
  },
  "bots": { "enabled": ${BOTS_ENABLED:-true} },
  "mascotVisits": ${MASCOT_VISITS:-[]},
  "cooldowns": { "send_emote": 250, "send_frame": 250 },
  "game": { "preferredSpawn": 0, "iglooIdOffset": 2000 },
  "email": {
    "from": "${EMAIL_FROM:-Club Penguin Live <no-reply@clubpenguinlive.net>}",
    "forceVerification": ${EMAIL_FORCE_VERIFICATION:-false},
    "skipFor": ${EMAIL_SKIP_FOR:-[]},
    "smtp": { "host": "${SMTP_HOST:-smtp.resend.com}", "port": ${SMTP_PORT:-465}, "secure": ${SMTP_SECURE:-true}, "user": "${SMTP_USER:-resend}", "pass": "${RESEND_API_KEY}" }
  }
}
EOF

if [ "${MODE}" = "migrate" ]; then
  echo "[entrypoint] applying migrations..."
  exec node ./utils/migrate.js
fi

: "${WORLD:?set WORLD=Login or WORLD=Blizzard}"
echo "[entrypoint] starting world ${WORLD}"
exec node dist/World.js "${WORLD}"
