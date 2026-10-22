#!/bin/sh
# Arranque del contenedor: migraciones, administrador inicial y servidor.
set -e

node scripts/migrate.mjs

# Crea el administrador o actualiza su contraseña desde ADMIN_EMAIL / ADMIN_PASSWORD
node scripts/create-admin.mjs --sync

exec node server.js
