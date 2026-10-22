import { eq } from "drizzle-orm";
import { db } from "@/db";
import { model } from "@/db/schema";
import { isAdmin } from "@/lib/dal";
import { readStoredFile } from "@/lib/storage";

/** Descarga del archivo original (solo administrador). */
export async function GET(_request: Request, ctx: RouteContext<"/api/models/[id]/file">) {
  if (!(await isAdmin())) return new Response("No autorizado", { status: 401 });
  const { id } = await ctx.params;
  const [m] = await db.select().from(model).where(eq(model.id, id)).limit(1);
  const data = m && (await readStoredFile(m.file));
  if (!data) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(m.originalName)}`,
    },
  });
}
