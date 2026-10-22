"use client";

import { Printer } from "lucide-react";
import { SheetSvg } from "@/components/sheet/sheet-svg";
import { Button } from "@/components/ui/button";
import { sheetSize } from "@/lib/drawing/sheet-math";
import type { SheetData } from "@/lib/types";

/** Plano a tamaño real para imprimir o «Guardar como PDF» desde el navegador. */
export function PrintSheet({ name, data, back }: { name: string; data: SheetData; back?: React.ReactNode }) {
  const [W, H] = sheetSize(data);
  return (
    <div className="flex min-h-svh flex-col bg-neutral-200 print:bg-white">
      {/* Tamaño y orientación de la página = tamaño de la hoja, sin márgenes del navegador */}
      <style>{`@page { size: ${W}mm ${H}mm; margin: 0; }`}</style>
      <div className="no-print flex items-center gap-3 border-b bg-background px-4 py-2">
        {back}
        <span className="font-semibold">{name}</span>
        <span className="text-xs text-muted-foreground">
          {data.size} horizontal · en el diálogo de impresión elige «Guardar como PDF» y escala 100 %
        </span>
        <Button className="ml-auto" size="sm" onClick={() => window.print()}>
          <Printer /> Imprimir / PDF
        </Button>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-6 print:block print:p-0">
        <SheetSvg data={data} className="h-auto w-full max-w-[1400px] bg-white shadow-lg print:hidden" />
        <SheetSvg data={data} print className="print-sheet hidden" />
      </div>
    </div>
  );
}
