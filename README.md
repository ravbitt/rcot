# Cotas

Plataforma web para acotar modelos 3D, armar sus planos y compartirlos con clientes.

- **Administrador** (cuenta con correo y contraseña): sube modelos STEP/IGES/STL, pone cotas sobre el
  modelo 3D, arma planos (láminas A4–A1 con vistas, cotas y rótulo) y crea enlaces para clientes.
- **Cliente** (sin cuenta): abre el enlace `/v/<token>` y ve el modelo con sus cotas y los planos,
  que puede imprimir o guardar en PDF. Los enlaces se pueden revocar y pueden tener vencimiento.

## Cómo funciona

| Parte | Detalle |
|---|---|
| Conversión | Al subir un STEP/IGES, OpenCascade (wasm, `occt-import-js`) lo tesela en el servidor una sola vez; la malla se guarda comprimida junto al original. Los STEP de SolidCraft conservan el nombre de cada pieza. |
| Visor 3D | three.js. El imán se pega a vértices, puntos medios y aristas de contorno. Cotas alineadas o por eje (X/Y/Z), en cm o mm. |
| Planos | Las vistas (frontal, laterales, posterior, superior, isométricas) se proyectan en el navegador: aristas de contorno y siluetas, con líneas ocultas punteadas calculadas sobre un mapa de profundidad. Las líneas se guardan con el plano. Las cotas 2D se pegan a los vértices de las vistas y miden en mm del modelo, sea cual sea la escala. |
| Impresión | El plano es un SVG en mm reales: «Imprimir / PDF» con `@page` del tamaño de la hoja. |
| Datos | Postgres (Drizzle). Archivos en `UPLOAD_DIR` (volumen en producción). |

Stack: Next.js 16, React 19, Tailwind 4 + shadcn, Drizzle + Postgres, Better Auth, three.js.

## Desarrollo

```sh
pnpm install
cp .env.example .env            # completa BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:up                      # Postgres en Docker (puerto 5434)
pnpm db:migrate
pnpm admin:create --email tu@correo.cl --name "Tu nombre"
pnpm dev
```

Comprobaciones: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

Prueba de punta a punta (con el servidor corriendo y el administrador de `.env`):

```sh
STEP_FILE=~/Downloads/CAD/Hassan-modulares/SMCV.step BASE_URL=http://localhost:3000 node e2e/flujo.mjs /tmp/cotas-e2e
```

En NixOS el Chromium que descarga Playwright no arranca: usa el de nixpkgs con
`CHROME_BIN=$(nix build nixpkgs#chromium --no-link --print-out-paths)/bin/chromium`.

Cambios en el esquema: edita `src/db/schema.ts`, luego `pnpm db:generate` y `pnpm db:migrate`.

## Despliegue en Coolify

Todo va en `docker-compose.yml` (app + Postgres + volúmenes): es **un solo recurso** en Coolify.

1. **Nuevo recurso** → desde el repositorio Git → Build Pack **Docker Compose** (archivo `docker-compose.yml`).
2. **Dominio**: en el servicio `app`, asigna tu dominio (p. ej. `https://cotas.tudominio.cl`). Coolify lo
   enruta al puerto interno 3000 y lo entrega a la app como `BETTER_AUTH_URL`.
3. **Variables de entorno**: Coolify genera solas las credenciales de la base, el secreto de autenticación
   y la contraseña inicial del administrador (`SERVICE_PASSWORD_ADMIN`, visible en *Environment Variables*).
   Tú defines:

   | Variable | |
   |---|---|
   | `ADMIN_EMAIL` | **Obligatoria**: correo del administrador |
   | `ADMIN_NAME` | Opcional |
   | `ADMIN_PASSWORD` | Opcional: si la defines, se usa en vez de la generada |
   | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Opcional (recomendada): `openssl rand -base64 32`. Evita errores en páginas abiertas durante un despliegue. |
   | `MAX_UPLOAD_MB` | Opcional, por defecto 100 |

4. **Desplegar**. Al arrancar, la app espera a que Postgres esté sano, aplica las migraciones y crea el
   administrador si todavía no hay ninguno. Los volúmenes `cotas-pg` (base) y `cotas-uploads` (modelos)
   persisten entre despliegues.

El healthcheck de la app es `/api/health`. Si el proxy limita el tamaño de las peticiones, súbelo para
permitir STEP grandes.

`docker-compose.dev.yml` es solo para desarrollo local (Postgres en el puerto 5434).
