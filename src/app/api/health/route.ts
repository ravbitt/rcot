import { sql } from "drizzle-orm";
import { db } from "@/db";

// Chequeo de salud para Coolify: responde 200 si la app y la base de datos están bien.
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "Base de datos no disponible" }, { status: 503 });
  }
}
