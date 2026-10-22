import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { PrintSheet } from "@/components/sheet/print-sheet";
import { db } from "@/db";
import { sheet } from "@/db/schema";
import { requireAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "Imprimir plano" };

export default async function PrintPage({ params }: PageProps<"/admin/modelos/[id]/planos/[sheetId]/imprimir">) {
  await requireAdmin();
  const { id, sheetId } = await params;
  const [s] = await db.select().from(sheet).where(and(eq(sheet.id, sheetId), eq(sheet.modelId, id))).limit(1);
  if (!s) notFound();
  return <PrintSheet name={s.name} data={s.data} />;
}
