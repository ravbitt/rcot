import { nanoid } from "nanoid";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { folder, model } from "@/db/schema";
import { ConvertError, convertModel, formatFromName } from "@/lib/convert";
import { isAdmin } from "@/lib/dal";
import { findDuplicate, sha256 } from "@/lib/duplicates";
import { deleteStoredFile, MAX_UPLOAD_BYTES, saveFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Sube un modelo (STEP, IGES o STL), lo convierte a malla y lo registra.
 * Si el mismo archivo ya está subido responde 409 con el modelo existente, salvo que venga `force=1`.
 */
export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "No autorizado" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Falta el archivo." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: `El archivo supera ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB.` }, { status: 413 });
  }
  const format = formatFromName(file.name);
  if (!format) return Response.json({ error: "Formato no admitido. Sube STEP, IGES o STL." }, { status: 400 });

  const name = String(form?.get("name") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
  // Carpeta opcional: debe existir
  const folderId = String(form?.get("folderId") ?? "").trim() || null;
  if (folderId) {
    const [f] = await db.select({ id: folder.id }).from(folder).where(eq(folder.id, folderId)).limit(1);
    if (!f) return Response.json({ error: "La carpeta no existe." }, { status: 400 });
  }
  const data = Buffer.from(await file.arrayBuffer());
  const fileHash = sha256(data);
  if (form?.get("force") !== "1") {
    const duplicate = await findDuplicate(fileHash);
    if (duplicate) return Response.json({ error: `Ya está subido como «${duplicate.name}».`, duplicate }, { status: 409 });
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
    const id = nanoid(12);
    await db.insert(model).values({
      id,
      folderId,
      name: name.slice(0, 120),
      originalName: file.name.slice(0, 200),
      format,
      file: stored,
      meshFile,
      bytes: file.size,
      bodyCount: converted.bodyCount,
      bbox: converted.bbox,
      fileHash,
    });
    return Response.json({ id });
  } catch (err) {
    await deleteStoredFile(stored);
    await deleteStoredFile(meshFile);
    throw err;
  }
}
