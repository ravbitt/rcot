import { eq } from "drizzle-orm";
import { db } from "@/db";
import { model } from "@/db/schema";
import { canReadModel, isAdmin } from "@/lib/dal";
import { deleteStoredFile, readStoredFile, saveFile } from "@/lib/storage";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_BYTES = 3 * 1024 * 1024;

/** Miniatura del modelo. Administrador o enlace de cliente (?t=token). */
export async function GET(request: Request, ctx: RouteContext<"/api/models/[id]/thumbnail">) {
  const { id } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t");
  if (!(await canReadModel(id, token))) return new Response("No autorizado", { status: 401 });
  const [m] = await db.select({ thumbFile: model.thumbFile }).from(model).where(eq(model.id, id)).limit(1);
  if (!m?.thumbFile) return new Response("Sin miniatura", { status: 404 });
  const etag = `"${m.thumbFile}"`;
  const cache = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: cache });
  const png = await readStoredFile(m.thumbFile);
  if (!png) return new Response("Sin miniatura", { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", ...cache } });
}

/** Guarda la miniatura que generó el navegador (PNG). Reemplaza la anterior. */
export async function PUT(request: Request, ctx: RouteContext<"/api/models/[id]/thumbnail">) {
  if (!(await isAdmin())) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length > MAX_BYTES || data.length < 8 || PNG_SIGNATURE.some((b, i) => data[i] !== b)) {
    return Response.json({ error: "Se espera una imagen PNG de hasta 3 MB" }, { status: 400 });
  }
  const [m] = await db.select({ thumbFile: model.thumbFile }).from(model).where(eq(model.id, id)).limit(1);
  if (!m) return Response.json({ error: "Modelo no encontrado" }, { status: 404 });
  const file = await saveFile(data, "thumb.png");
  await db.update(model).set({ thumbFile: file }).where(eq(model.id, id));
  if (m.thumbFile) await deleteStoredFile(m.thumbFile);
  return Response.json({ ok: true });
}
