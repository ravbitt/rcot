// Aplica las migraciones pendientes. En producción se ejecuta al iniciar el contenedor, antes del servidor.
// Uso local: pnpm db:migrate (drizzle-kit). En el contenedor: node scripts/migrate.mjs
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.resolve("src/db/migrations");
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log("✓ Migraciones al día");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("✗ Error al migrar:", err);
  process.exit(1);
});
