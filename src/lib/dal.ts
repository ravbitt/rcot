import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { model, share } from "@/db/schema";
import { auth } from "@/lib/auth";

export type AdminUser = { id: string; name: string; email: string };

/** Sesión del administrador o null. Memorizada por petición. */
export const getAdminSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** Exige la sesión del administrador. Úsala en toda página, acción o ruta del panel. */
export async function requireAdmin(): Promise<AdminUser> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { id, name, email } = session.user;
  return { id, name, email };
}

/** Para rutas de API: true si hay sesión de administrador (sin redirigir). */
export async function isAdmin() {
  return !!(await getAdminSession());
}

/** Enlace de cliente vigente (no revocado ni vencido) con su modelo, o null. */
export const getShare = cache(async (token: string) => {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db
    .select({ share, model })
    .from(share)
    .innerJoin(model, eq(model.id, share.modelId))
    .where(and(eq(share.token, token), isNull(share.revokedAt)))
    .limit(1);
  if (!row) return null;
  if (row.share.expiresAt && row.share.expiresAt.getTime() < Date.now()) return null;
  return row;
});

/** Registra una visita al enlace (sin bloquear la respuesta si falla). */
export async function touchShare(id: string) {
  await db
    .update(share)
    .set({ viewCount: sql`${share.viewCount} + 1`, lastViewedAt: new Date() })
    .where(eq(share.id, id))
    .catch(() => {});
}

/** ¿Puede quien hace la petición leer el modelo? Administrador, o un token de enlace del mismo modelo. */
export async function canReadModel(modelId: string, token: string | null) {
  if (await isAdmin()) return true;
  if (!token) return false;
  const s = await getShare(token);
  return !!s && s.model.id === modelId;
}
