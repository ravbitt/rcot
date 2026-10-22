import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { SheetEditor } from "@/components/sheet/sheet-editor";
import { db } from "@/db";
import { model, sheet } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "Plano" };

export default async function SheetPage({ params }: PageProps<"/admin/modelos/[id]/planos/[sheetId]">) {
  await requireAdmin();
  const { id, sheetId } = await params;
  const [row] = await db
    .select({ sheet, modelName: model.name })
    .from(sheet)
    .innerJoin(model, eq(model.id, sheet.modelId))
    .where(and(eq(sheet.id, sheetId), eq(sheet.modelId, id)))
    .limit(1);
  if (!row) notFound();
  return <SheetEditor sheetId={row.sheet.id} modelId={id} modelName={row.modelName} name={row.sheet.name} data={row.sheet.data} />;
}
