import "server-only";
import { asc, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { dimension, folder, model, sheet } from "@/db/schema";
import type { Vec3 } from "@/lib/types";

export type ModelCardData = {
  id: string;
  name: string;
  format: string;
  bodyCount: number;
  bbox: [Vec3, Vec3];
  thumbFile: string | null;
  createdAt: string;
  dims: number;
  sheets: number;
};

export type FolderCardData = { id: string; name: string; models: number; thumbs: { id: string; thumbFile: string }[] };

/** Modelos de una carpeta (o sin carpeta con null), con sus conteos de cotas y planos. */
export async function listModels(folderId: string | null): Promise<ModelCardData[]> {
  const rows = await db
    .select({
      id: model.id,
      name: model.name,
      format: model.format,
      bodyCount: model.bodyCount,
      bbox: model.bbox,
      thumbFile: model.thumbFile,
      createdAt: model.createdAt,
    })
    .from(model)
    .where(folderId ? eq(model.folderId, folderId) : isNull(model.folderId))
    .orderBy(desc(model.createdAt));
  const dimCounts = new Map(
    (await db.select({ id: dimension.modelId, n: count() }).from(dimension).groupBy(dimension.modelId)).map((r) => [r.id, r.n]),
  );
  const sheetCounts = new Map((await db.select({ id: sheet.modelId, n: count() }).from(sheet).groupBy(sheet.modelId)).map((r) => [r.id, r.n]));
  return rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), dims: dimCounts.get(m.id) ?? 0, sheets: sheetCounts.get(m.id) ?? 0 }));
}

/** Carpetas con su cantidad de modelos y hasta 4 miniaturas para el mosaico. */
export async function listFolders(): Promise<FolderCardData[]> {
  const folders = await db.select().from(folder).orderBy(asc(folder.name));
  const counts = new Map(
    (await db.select({ id: model.folderId, n: count() }).from(model).where(isNotNull(model.folderId)).groupBy(model.folderId)).map((r) => [r.id, r.n]),
  );
  const thumbs = await db
    .select({ id: model.id, folderId: model.folderId, thumbFile: model.thumbFile })
    .from(model)
    .where(isNotNull(model.thumbFile))
    .orderBy(desc(model.createdAt));
  return folders.map((f) => ({
    id: f.id,
    name: f.name,
    models: counts.get(f.id) ?? 0,
    thumbs: thumbs.filter((t) => t.folderId === f.id).slice(0, 4) as { id: string; thumbFile: string }[],
  }));
}

export async function getFolder(id: string) {
  const [f] = await db.select().from(folder).where(eq(folder.id, id)).limit(1);
  return f ?? null;
}

/** Solo id y nombre, para los menús «Mover a…». */
export async function folderOptions() {
  return db.select({ id: folder.id, name: folder.name }).from(folder).orderBy(asc(folder.name));
}
