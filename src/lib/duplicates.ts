import "server-only";
import { createHash } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { folder, model } from "@/db/schema";
import { readStoredFile } from "@/lib/storage";

export const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/** Calcula el hash de los modelos subidos antes de que existiera la detección de repetidos. */
async function backfillHashes() {
  const pending = await db.select({ id: model.id, file: model.file }).from(model).where(isNull(model.fileHash));
  for (const m of pending) {
    const data = await readStoredFile(m.file);
    if (data) await db.update(model).set({ fileHash: sha256(data) }).where(eq(model.id, m.id));
  }
}

export type Duplicate = { id: string; name: string; folder: string | null };

/** Modelo ya subido con el mismo archivo (byte a byte), sin contar `exceptId`. */
export async function findDuplicate(hash: string, exceptId?: string): Promise<Duplicate | null> {
  await backfillHashes();
  const [m] = await db
    .select({ id: model.id, name: model.name, folder: folder.name })
    .from(model)
    .leftJoin(folder, eq(folder.id, model.folderId))
    .where(exceptId ? and(eq(model.fileHash, hash), ne(model.id, exceptId)) : eq(model.fileHash, hash))
    .limit(1);
  return m ?? null;
}
