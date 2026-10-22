import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dimension } from "@/db/schema";
import { isAdmin } from "@/lib/dal";
import { dimensionPatch } from "@/lib/validation";

export async function PATCH(request: Request, ctx: RouteContext<"/api/dimensions/[id]">) {
  if (!(await isAdmin())) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = dimensionPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Datos inválidos" }, { status: 400 });
  const [row] = await db.update(dimension).set(parsed.data).where(eq(dimension.id, id)).returning();
  if (!row) return Response.json({ error: "No encontrada" }, { status: 404 });
  return Response.json(row);
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/dimensions/[id]">) {
  if (!(await isAdmin())) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  await db.delete(dimension).where(eq(dimension.id, id));
  return Response.json({ ok: true });
}
