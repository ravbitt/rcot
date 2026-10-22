import type { Metadata } from "next";
import Link from "next/link";
import { count, desc } from "drizzle-orm";
import { Box, FileBox } from "lucide-react";
import { UploadModelDialog } from "@/components/admin/upload-model-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/db";
import { dimension, model, sheet } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "Modelos" };

export default async function ModelsPage() {
  await requireAdmin();
  const rows = await db
    .select({
      id: model.id,
      name: model.name,
      format: model.format,
      bodyCount: model.bodyCount,
      bbox: model.bbox,
      createdAt: model.createdAt,
    })
    .from(model)
    .orderBy(desc(model.createdAt));
  const dimCounts = new Map(
    (await db.select({ id: dimension.modelId, n: count() }).from(dimension).groupBy(dimension.modelId)).map((r) => [r.id, r.n]),
  );
  const sheetCounts = new Map(
    (await db.select({ id: sheet.modelId, n: count() }).from(sheet).groupBy(sheet.modelId)).map((r) => [r.id, r.n]),
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Modelos</h1>
          <p className="text-sm text-muted-foreground">Sube un STEP (o IGES/STL), acótalo, arma sus planos y compártelo con tu cliente.</p>
        </div>
        <UploadModelDialog />
      </div>
      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileBox />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay modelos</EmptyTitle>
            <EmptyDescription>Sube el primero: los STEP exportados desde SolidCraft conservan el nombre de cada pieza.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => {
            const [min, max] = m.bbox;
            const size = [0, 1, 2].map((k) => Math.round(max[k] - min[k])).join(" × ");
            return (
              <Link key={m.id} href={`/admin/modelos/${m.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-primary/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Box className="size-4 text-muted-foreground" />
                      {m.name}
                    </CardTitle>
                    <CardDescription>{size} mm</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{m.bodyCount} piezas</span>
                    <span>{dimCounts.get(m.id) ?? 0} cotas</span>
                    <span>{sheetCounts.get(m.id) ?? 0} planos</span>
                    <span className="uppercase">{m.format}</span>
                    <span className="ml-auto">{m.createdAt.toLocaleDateString("es-CL")}</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
