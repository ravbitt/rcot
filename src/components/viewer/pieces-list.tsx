"use client";

import { formatLength } from "@/lib/geometry/dim";
import type { PieceGroup } from "@/lib/geometry/pieces";

/** Despiece como leyenda: marca, color, nombre, cantidad y medidas (largo × ancho × espesor). */
export function PiecesList({ groups, unit, decimals }: { groups: PieceGroup[]; unit: "mm" | "cm"; decimals: number }) {
  const total = groups.reduce((a, g) => a + g.qty, 0);
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
          {groups.map((g) => (
            <tr key={g.mark} className="border-t" title={g.names.join(", ")}>
              <td className="py-1 pl-3">
                <span className="inline-block size-3 rounded-sm border border-black/30 align-middle" style={{ background: g.color }} />
              </td>
              <td className="py-1 pl-1.5">
                <b className="font-mono">{g.mark}</b> {g.name}
              </td>
              <td className="px-2 py-1 text-right font-mono">{g.qty}</td>
              <td className="py-1 pr-3 pl-1 text-right font-mono whitespace-nowrap">
                {g.dims.map((d) => formatLength(d, unit, decimals)).join("×")}
              </td>
            </tr>
          ))}
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
    </div>
  );
}
