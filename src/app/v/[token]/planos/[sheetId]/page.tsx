import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PrintSheet } from "@/components/sheet/print-sheet";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { sheet } from "@/db/schema";
import { getShare } from "@/lib/dal";

export const metadata: Metadata = { title: "Plano" };

export default async function ShareSheetPage({ params }: PageProps<"/v/[token]/planos/[sheetId]">) {
  const { token, sheetId } = await params;
  const s = await getShare(token);
  if (!s || !s.share.showSheets) notFound();
  const [row] = await db.select().from(sheet).where(and(eq(sheet.id, sheetId), eq(sheet.modelId, s.model.id))).limit(1);
  if (!row) notFound();
  return (
    <PrintSheet
      name={row.name}
      data={row.data}
      back={
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={`/v/${token}`} aria-label="Volver">
            <ArrowLeft />
          </Link>
        </Button>
      }
    />
  );
}
