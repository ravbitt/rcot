import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Carpeta de modelos subidos. En producción es un volumen de Docker. */
export const UPLOAD_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "data/uploads");
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 100) * 1024 * 1024;

// Solo nombres generados por nosotros: evita leer o borrar fuera de la carpeta
const FILE_RE = /^[0-9a-f-]{36}\.(step|iges|stl|mesh\.json\.gz)$/;

export async function saveFile(data: Buffer | Uint8Array, ext: string) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const file = `${randomUUID()}.${ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, file), data);
  return file;
}

export async function readStoredFile(file: string) {
  if (!FILE_RE.test(file)) return null;
  try {
    return await readFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, file));
  } catch {
    return null;
  }
}

export async function deleteStoredFile(file: string) {
  if (!FILE_RE.test(file)) return;
  await unlink(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, file)).catch(() => {});
}
