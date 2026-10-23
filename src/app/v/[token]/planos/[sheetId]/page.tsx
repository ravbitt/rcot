import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PrintSheet } from "@/components/sheet/print-sheet";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { sheet } from "@/db/schema";
import { getShare, shareModel } from "@/lib/dal";

export const metadata: Metadata = { title: "Plano" };

export default async function ShareSheetPage({ params }: PageProps<"/v/[token]/planos/[sheetId]">) {
  const { token, sheetId } = await params;
  const s = await getShare(token);
  if (!s || !s.share.showSheets) notFound();
  const [row] = await db.select().from(sheet).where(eq(sheet.id, sheetId)).limit(1);
  // El plano debe ser del modelo del enlace o de un modelo del proyecto compartido
  if (!row || !(await shareModel(token, row.modelId))) notFound();
  const back = s.folder ? `/v/${token}/m/${row.modelId}` : `/v/${token}`;
  return (
    <PrintSheet
      name={row.name}
      data={row.data}
      back={
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={back} aria-label="Volver">
            <ArrowLeft />
          </Link>
        </Button>
      }
    />
  );
}
