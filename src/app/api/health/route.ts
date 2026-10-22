import { sql } from "drizzle-orm";
import { db } from "@/db";

// Chequeo de salud para Coolify: responde 200 si la app y la base de datos están bien.
// Incluye la URL pública con la que arrancó la autenticación (debe coincidir con la del navegador, con https).
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, authUrl: process.env.BETTER_AUTH_URL ?? null });
  } catch {
    return Response.json({ ok: false, error: "Base de datos no disponible" }, { status: 503 });
  }
}
