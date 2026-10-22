import { count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { model, sheet } from "@/db/schema";
import { isAdmin } from "@/lib/dal";
import { emptySheet } from "@/lib/types";

/** Crea un plano vacío para el modelo. */
export async function POST(request: Request, ctx: RouteContext<"/api/models/[id]/sheets">) {
  if (!(await isAdmin())) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { id: modelId } = await ctx.params;
  const [m] = await db.select({ name: model.name }).from(model).where(eq(model.id, modelId)).limit(1);
  if (!m) return Response.json({ error: "Modelo no encontrado" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const [{ n }] = await db.select({ n: count() }).from(sheet).where(eq(sheet.modelId, modelId));
  const fecha = new Date().toLocaleDateString("es-CL");
  const [row] = await db
    .insert(sheet)
    .values({
      id: nanoid(12),
      modelId,
      name: (body.name ?? "").trim().slice(0, 120) || `Plano ${n + 1}`,
      position: n,
      data: emptySheet({ proyecto: m.name, plano: m.name, fecha }),
    })
    .returning({ id: sheet.id });
  return Response.json(row);
}
