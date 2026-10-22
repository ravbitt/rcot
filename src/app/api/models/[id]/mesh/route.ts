import { eq } from "drizzle-orm";
import { db } from "@/db";
import { model } from "@/db/schema";
import { canReadModel } from "@/lib/dal";
import { readStoredFile } from "@/lib/storage";

/** Malla del modelo para el visor (JSON comprimido). Administrador o enlace de cliente (?t=token). */
export async function GET(request: Request, ctx: RouteContext<"/api/models/[id]/mesh">) {
  const { id } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t");
  if (!(await canReadModel(id, token))) return new Response("No autorizado", { status: 401 });
  const [m] = await db.select({ meshFile: model.meshFile }).from(model).where(eq(model.id, id)).limit(1);
  const gz = m && (await readStoredFile(m.meshFile));
  if (!gz) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(gz), {
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
