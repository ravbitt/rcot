import { nanoid } from "nanoid";
import { db } from "@/db";
import { dimension } from "@/db/schema";
import { isAdmin } from "@/lib/dal";
import { dimensionInput } from "@/lib/validation";

/** Crea una cota 3D en el modelo. */
export async function POST(request: Request, ctx: RouteContext<"/api/models/[id]/dimensions">) {
  if (!(await isAdmin())) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { id: modelId } = await ctx.params;
  const parsed = dimensionInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Cota inválida" }, { status: 400 });
  const [row] = await db
    .insert(dimension)
    .values({ id: nanoid(12), modelId, ...parsed.data, label: parsed.data.label || null })
    .returning();
  return Response.json(row);
}
