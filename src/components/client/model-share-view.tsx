import { asc, eq } from "drizzle-orm";
import { ClientView } from "@/components/client/client-view";
import { db } from "@/db";
import { dimension, model, sheet } from "@/db/schema";
import { listMaterials } from "@/lib/queries";

type Model = typeof model.$inferSelect;

/** Vista del cliente de un modelo (enlace del modelo o modelo dentro de un proyecto compartido). */
export async function ModelShareView({ token, m, showSheets, backHref, project }: { token: string; m: Model; showSheets: boolean; backHref?: string; project?: string }) {
  const [dims, sheets, catalog] = await Promise.all([
    db.select().from(dimension).where(eq(dimension.modelId, m.id)).orderBy(asc(dimension.createdAt)),
    showSheets
      ? db.select({ id: sheet.id, name: sheet.name, data: sheet.data }).from(sheet).where(eq(sheet.modelId, m.id)).orderBy(asc(sheet.position), asc(sheet.createdAt))
      : Promise.resolve([]),
    listMaterials(),
  ]);
  // solo los materiales que usa el modelo
  const used = new Set(Object.values(m.materials));
  return (
    <ClientView
      token={token}
      backHref={backHref}
      project={project}
      model={{ id: m.id, name: m.name, bbox: m.bbox, notes: m.notes, meshVersion: m.meshFile.slice(0, 8) }}
      catalog={catalog.filter((c) => used.has(c.id))}
      materials={m.materials}
      dimensions={dims.map((d) => ({ id: d.id, kind: d.kind, a: d.a, b: d.b, c: d.c, offset: d.offset, axis: d.axis, label: d.label }))}
      sheets={sheets}
    />
  );
}
