"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { model, share, sheet } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";
import { deleteStoredFile } from "@/lib/storage";

export type ActionResult = { ok: true } | { ok: false; error: string };

const shareInput = z.object({
  modelId: z.string().min(1),
  label: z.string().trim().max(120),
  showSheets: z.boolean(),
  expiresAt: z.string().optional().nullable(),
});

/** Crea un enlace de solo lectura para un cliente. */
export async function createShare(input: z.input<typeof shareInput>): Promise<ActionResult & { token?: string }> {
  await requireAdmin();
  const p = shareInput.safeParse(input);
  if (!p.success) return { ok: false, error: "Datos inválidos" };
  const expires = p.data.expiresAt ? new Date(`${p.data.expiresAt}T23:59:59`) : null;
  if (expires && Number.isNaN(expires.getTime())) return { ok: false, error: "Fecha inválida" };
  const token = nanoid(24);
  await db.insert(share).values({
    id: nanoid(12),
    token,
    modelId: p.data.modelId,
    label: p.data.label,
    showSheets: p.data.showSheets,
    expiresAt: expires,
  });
  revalidatePath(`/admin/modelos/${p.data.modelId}`);
  return { ok: true, token };
}

export async function revokeShare(id: string, modelId: string): Promise<ActionResult> {
  await requireAdmin();
  await db.update(share).set({ revokedAt: new Date() }).where(and(eq(share.id, id), eq(share.modelId, modelId)));
  revalidatePath(`/admin/modelos/${modelId}`);
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

/** Borra el modelo con sus cotas, planos y enlaces (en cascada) y sus archivos. */
export async function deleteModel(id: string) {
  await requireAdmin();
  const [m] = await db.delete(model).where(eq(model.id, id)).returning();
  if (m) {
    await deleteStoredFile(m.file);
    await deleteStoredFile(m.meshFile);
  }
  revalidatePath("/admin");
  redirect("/admin");
}

export async function renameSheet(id: string, modelId: string, name: string): Promise<ActionResult> {
  await requireAdmin();
  const n = name.trim().slice(0, 120);
  if (!n) return { ok: false, error: "El nombre no puede quedar vacío" };
  await db.update(sheet).set({ name: n }).where(and(eq(sheet.id, id), eq(sheet.modelId, modelId)));
  revalidatePath(`/admin/modelos/${modelId}`);
  return { ok: true };
}
