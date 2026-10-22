#!/bin/sh
# Arranque del contenedor: migraciones, administrador inicial y servidor.
set -e

node scripts/migrate.mjs

# Crea el administrador si todavía no hay ninguno y están ADMIN_EMAIL y ADMIN_PASSWORD
node scripts/create-admin.mjs --if-none

exec node server.js
