import { eq } from "drizzle-orm";
import { db } from "@/db";
import { model } from "@/db/schema";
import { ConvertError, convertModel, formatFromName } from "@/lib/convert";
import { isAdmin } from "@/lib/dal";
import { findDuplicate, sha256 } from "@/lib/duplicates";
import { deleteStoredFile, MAX_UPLOAD_BYTES, readStoredFile, saveFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

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

/**
 * Reemplaza el archivo del modelo por una versión nueva. Se conservan las cotas, los planos, los enlaces
 * y los materiales (por nombre de pieza); la miniatura la vuelve a generar el navegador.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/models/[id]/file">) {
  if (!(await isAdmin())) return Response.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await ctx.params;
  const [m] = await db.select().from(model).where(eq(model.id, id)).limit(1);
  if (!m) return Response.json({ error: "Modelo no encontrado" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Falta el archivo." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: `El archivo supera ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB.` }, { status: 413 });
  }
  const format = formatFromName(file.name);
  if (!format) return Response.json({ error: "Formato no admitido. Sube STEP, IGES o STL." }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  const fileHash = sha256(data);
  if (fileHash === m.fileHash) return Response.json({ error: "Es el mismo archivo que ya tiene el modelo." }, { status: 409 });
  if (form?.get("force") !== "1") {
    const duplicate = await findDuplicate(fileHash, id);
    if (duplicate) return Response.json({ error: `Ese archivo ya está subido como «${duplicate.name}».`, duplicate }, { status: 409 });
  }
  let converted;
  try {
    converted = await convertModel(data, format);
  } catch (err) {
    const msg = err instanceof ConvertError ? err.message : "No se pudo procesar el modelo.";
    console.error("convert", err);
    return Response.json({ error: msg }, { status: 422 });
  }
  const stored = await saveFile(data, format);
  const meshFile = await saveFile(converted.gz, "mesh.json.gz");
  try {
    await db
      .update(model)
      .set({
        originalName: file.name.slice(0, 200),
        format,
        file: stored,
        meshFile,
        bytes: file.size,
        bodyCount: converted.bodyCount,
        bbox: converted.bbox,
        fileHash,
        thumbFile: null,
      })
      .where(eq(model.id, id));
  } catch (err) {
    await deleteStoredFile(stored);
    await deleteStoredFile(meshFile);
    throw err;
  }
  await Promise.all([deleteStoredFile(m.file), deleteStoredFile(m.meshFile), m.thumbFile ? deleteStoredFile(m.thumbFile) : null]);
  // Piezas con material que ya no están en el archivo nuevo (cambiaron de nombre o se borraron)
  const names = new Set(converted.names);
  const lost = Object.keys(m.materials).filter((n) => !names.has(n));
  return Response.json({ ok: true, bodyCount: converted.bodyCount, lostMaterials: lost });
}
