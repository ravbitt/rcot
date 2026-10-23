"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { folder, model, share, sheet } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { deleteStoredFile } from "@/lib/storage";

export type ActionResult = { ok: true } | { ok: false; error: string };

const shareInput = z.object({
  /** Uno de los dos: el modelo o la carpeta (proyecto) que se comparte */
  modelId: z.string().min(1).optional(),
  folderId: z.string().min(1).optional(),
  label: z.string().trim().max(120),
  showSheets: z.boolean(),
  expiresAt: z.string().optional().nullable(),
});

/** Crea un enlace de solo lectura para un cliente. */
export async function createShare(input: z.input<typeof shareInput>): Promise<ActionResult & { token?: string }> {
  await requireAdmin();
  const p = shareInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Datos inválidos" };
  if (!p.data.modelId === !p.data.folderId) return { ok: false, error: "Elige un modelo o una carpeta" };
  const expires = p.data.expiresAt ? new Date(`${p.data.expiresAt}T23:59:59`) : null;
  if (expires && Number.isNaN(expires.getTime())) return { ok: false, error: "Fecha inválida" };
  const token = nanoid(24);
  await db.insert(share).values({
    id: nanoid(12),
    token,
    modelId: p.data.modelId ?? null,
    folderId: p.data.folderId ?? null,
    label: p.data.label,
    showSheets: p.data.showSheets,
    expiresAt: expires,
  });
  revalidatePath(p.data.modelId ? `/admin/modelos/${p.data.modelId}` : `/admin/carpetas/${p.data.folderId}`);
  return { ok: true, token };
}

export async function revokeShare(id: string, modelId: string): Promise<ActionResult> {
  await requireAdmin();
  await db.update(share).set({ revokedAt: new Date() }).where(and(eq(share.id, id), eq(share.modelId, modelId)));
  revalidatePath(`/admin/modelos/${modelId}`);
  return { ok: true };
}

export async function revokeFolderShare(id: string, folderId: string): Promise<ActionResult> {
  await requireAdmin();
  await db.update(share).set({ revokedAt: new Date() }).where(and(eq(share.id, id), eq(share.folderId, folderId)));
  revalidatePath(`/admin/carpetas/${folderId}`);
  return { ok: true };
}

export async function renameModel(id: string, name: string): Promise<ActionResult> {
  await requireAdmin();
  const n = name.trim().slice(0, 120);
  if (!n) return { ok: false, error: "El nombre no puede quedar vacío" };
  await db.update(model).set({ name: n }).where(eq(model.id, id));
  revalidatePath("/admin");
  revalidatePath(`/admin/modelos/${id}`);
  return { ok: true };
}

/** Borra el modelo con sus cotas, planos y enlaces (en cascada) y sus archivos. Vuelve a su carpeta. */
export async function deleteModel(id: string) {
  await requireAdmin();
  const [m] = await db.delete(model).where(eq(model.id, id)).returning();
  if (m) {
    await deleteStoredFile(m.file);
    await deleteStoredFile(m.meshFile);
    if (m.thumbFile) await deleteStoredFile(m.thumbFile);
  }
  revalidatePath("/admin", "layout");
  redirect(m?.folderId ? `/admin/carpetas/${m.folderId}` : "/admin");
}

// ── Carpetas ──────────────────────────────────────────────────────────

const folderName = z.string().trim().min(1, "El nombre no puede quedar vacío").max(120);

export async function createFolder(name: string): Promise<ActionResult & { id?: string }> {
  await requireAdmin();
  const p = folderName.safeParse(name);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const id = nanoid(12);
  await db.insert(folder).values({ id, name: p.data });
  revalidatePath("/admin", "layout");
  return { ok: true, id };
}

export async function renameFolder(id: string, name: string): Promise<ActionResult> {
  await requireAdmin();
  const p = folderName.safeParse(name);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  await db.update(folder).set({ name: p.data }).where(eq(folder.id, id));
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Borra la carpeta; sus modelos no se borran: quedan «sin carpeta». */
export async function deleteFolder(id: string) {
  await requireAdmin();
  await db.delete(folder).where(eq(folder.id, id));
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

/** Mueve un modelo a una carpeta (o a «sin carpeta» con null). */
export async function moveModel(modelId: string, folderId: string | null): Promise<ActionResult> {
  await requireAdmin();
  if (folderId) {
    const [f] = await db.select({ id: folder.id }).from(folder).where(eq(folder.id, folderId)).limit(1);
    if (!f) return { ok: false, error: "La carpeta no existe" };
  }
  await db.update(model).set({ folderId }).where(eq(model.id, modelId));
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function renameSheet(id: string, modelId: string, name: string): Promise<ActionResult> {
  await requireAdmin();
  const n = name.trim().slice(0, 120);
  if (!n) return { ok: false, error: "El nombre no puede quedar vacío" };
  await db.update(sheet).set({ name: n }).where(and(eq(sheet.id, id), eq(sheet.modelId, modelId)));
  revalidatePath(`/admin/modelos/${modelId}`);
  return { ok: true };
}
