import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sheet } from "@/db/schema";
import { isAdmin } from "@/lib/dal";
import { sheetInput } from "@/lib/validation";

/** Guarda el plano completo (nombre y contenido). */
export async function PUT(request: Request, ctx: RouteContext<"/api/sheets/[id]">) {
  if (!(await isAdmin())) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = sheetInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Plano inválido", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const [row] = await db.update(sheet).set(parsed.data).where(eq(sheet.id, id)).returning({ id: sheet.id, updatedAt: sheet.updatedAt });
  if (!row) return Response.json({ error: "No encontrado" }, { status: 404 });
  return Response.json(row);
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/sheets/[id]">) {
  if (!(await isAdmin())) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  await db.delete(sheet).where(eq(sheet.id, id));
  return Response.json({ ok: true });
}
