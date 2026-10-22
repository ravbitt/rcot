import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ClientView } from "@/components/client/client-view";
import { db } from "@/db";
import { dimension, sheet } from "@/db/schema";
import { getShare, touchShare } from "@/lib/dal";

export async function generateMetadata({ params }: PageProps<"/v/[token]">): Promise<Metadata> {
  const { token } = await params;
  const s = await getShare(token);
  return { title: s?.model.name ?? "Enlace no disponible" };
}

export default async function SharePage({ params }: PageProps<"/v/[token]">) {
  const { token } = await params;
  const s = await getShare(token);
  if (!s) notFound();
  await touchShare(s.share.id);
  const [dims, sheets] = await Promise.all([
    db.select().from(dimension).where(eq(dimension.modelId, s.model.id)).orderBy(asc(dimension.createdAt)),
    s.share.showSheets
      ? db
          .select({ id: sheet.id, name: sheet.name, data: sheet.data })
          .from(sheet)
          .where(eq(sheet.modelId, s.model.id))
          .orderBy(asc(sheet.position), asc(sheet.createdAt))
      : Promise.resolve([]),
  ]);
  return (
    <ClientView
      token={token}
      model={{ id: s.model.id, name: s.model.name, bbox: s.model.bbox, notes: s.model.notes }}
      dimensions={dims.map((d) => ({ id: d.id, a: d.a, b: d.b, offset: d.offset, axis: d.axis, label: d.label }))}
      sheets={sheets}
    />
  );
}
