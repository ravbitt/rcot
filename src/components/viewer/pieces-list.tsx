"use client";

import { formatLength } from "@/lib/geometry/dim";
import type { PieceGroup } from "@/lib/geometry/pieces";
import { formatAmount, materialTotals } from "@/lib/materials";
import type { Material } from "@/lib/types";

/** Despiece como leyenda: marca, color, nombre, material, cantidad y medidas (largo × ancho × espesor), con totales por material. */
export function PiecesList({ groups, unit, decimals, catalog = [] }: { groups: PieceGroup[]; unit: "mm" | "cm"; decimals: number; catalog?: Material[] }) {
  const total = groups.reduce((a, g) => a + g.qty, 0);
  const matOf = (g: PieceGroup) => catalog.find((m) => m.id === g.materialId);
  const withMaterials = groups.some((g) => matOf(g));
  const totals = withMaterials ? materialTotals(groups, catalog) : [];
  return (
    <div className="text-xs">
      <table className="w-full">
        <thead className="text-muted-foreground">
          <tr className="text-left">
            <th className="py-1 pl-3 font-medium" colSpan={2}>
              Pieza
            </th>
            <th className="px-2 py-1 text-right font-medium">Cant.</th>
            <th className="py-1 pr-3 pl-1 text-right font-medium">
              L × A × E ({unit})
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const m = matOf(g);
            return (
              <tr key={g.mark} className="border-t" title={g.names.join(", ")}>
                <td className="py-1 pl-3">
                  <span className="inline-block size-3 rounded-sm border border-black/30 align-middle" style={{ background: g.color }} />
                </td>
                <td className="py-1 pl-1.5">
                  <b className="font-mono">{g.mark}</b> {g.name}
                  {withMaterials && (
                    <span className="block text-[11px] text-muted-foreground">
                      {m ? (
                        <>
                          <span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: m.color }} />
                          {m.name}
                        </>
                      ) : (
                        "Sin material"
                      )}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1 text-right font-mono">{g.qty}</td>
                <td className="py-1 pr-3 pl-1 text-right font-mono whitespace-nowrap">
                  {g.dims.map((d) => formatLength(d, unit, decimals)).join("×")}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <td className="py-1 pl-3" colSpan={2}>
              {groups.length} tipos
            </td>
            <td className="px-2 py-1 text-right font-mono">{total}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {totals.length > 0 && (
        <table className="mt-2 w-full border-t" data-testid="material-totals">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pl-3 font-medium">Material</th>
              <th className="px-2 py-1 text-right font-medium">Piezas</th>
              <th className="py-1 pr-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.material?.id ?? "none"} className="border-t">
                <td className="py-1 pl-3">
                  <span className="mr-1.5 inline-block size-3 rounded-sm border border-black/30 align-middle" style={{ background: t.material?.color ?? "#e5e5e5" }} />
                  {t.material?.name ?? "Sin material"}
                </td>
                <td className="px-2 py-1 text-right font-mono">{t.qty}</td>
                <td className="py-1 pr-3 text-right font-mono whitespace-nowrap">{t.material ? formatAmount(t) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
