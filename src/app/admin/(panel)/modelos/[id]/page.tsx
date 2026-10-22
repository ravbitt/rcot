import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ModelWorkspace } from "@/components/admin/model-workspace";
import { db } from "@/db";
import { dimension, model, share, sheet } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";

/** ¿Ya pasó la fecha? (vencimiento de un enlace) */
const isPast = (d: Date | null) => !!d && d.getTime() < Date.now();

export async function generateMetadata({ params }: PageProps<"/admin/modelos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const [m] = await db.select({ name: model.name }).from(model).where(eq(model.id, id)).limit(1);
  return { title: m?.name ?? "Modelo" };
}

export default async function ModelPage({ params }: PageProps<"/admin/modelos/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const [m] = await db.select().from(model).where(eq(model.id, id)).limit(1);
  if (!m) notFound();
  const [dims, sheets, shares] = await Promise.all([
    db.select().from(dimension).where(eq(dimension.modelId, id)).orderBy(asc(dimension.createdAt)),
    db
      .select({ id: sheet.id, name: sheet.name, data: sheet.data, updatedAt: sheet.updatedAt })
      .from(sheet)
      .where(eq(sheet.modelId, id))
      .orderBy(asc(sheet.position), asc(sheet.createdAt)),
    db.select().from(share).where(eq(share.modelId, id)).orderBy(desc(share.createdAt)),
  ]);
  return (
    <ModelWorkspace
      model={{ id: m.id, name: m.name, bodyCount: m.bodyCount, bbox: m.bbox, originalName: m.originalName, format: m.format }}
      dimensions={dims.map((d) => ({ id: d.id, a: d.a, b: d.b, offset: d.offset, axis: d.axis, label: d.label }))}
      sheets={sheets.map((s) => ({ id: s.id, name: s.name, data: s.data, updatedAt: s.updatedAt.toISOString() }))}
      shares={shares.map((s) => ({
        id: s.id,
        token: s.token,
        label: s.label,
        showSheets: s.showSheets,
        expiresAt: s.expiresAt?.toISOString() ?? null,
        revokedAt: s.revokedAt?.toISOString() ?? null,
        viewCount: s.viewCount,
        lastViewedAt: s.lastViewedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        expired: isPast(s.expiresAt),
      }))}
    />
  );
}
