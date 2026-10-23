// Materiales del despiece: sugerencias por pieza y totales por material.
//
// El STEP no trae materiales: se asignan en la web por nombre de pieza (sobreviven a reemplazar el archivo
// si la pieza conserva su nombre). Las sugerencias usan el nombre, el espesor y si la pieza es curva.

import type { PieceGroup } from "@/lib/geometry/pieces";
import type { Material, MaterialKind, MaterialMap } from "@/lib/types";

export const KIND_LABEL: Record<MaterialKind, string> = { tablero: "Tablero", liston: "Listón", lamina: "Lámina", otro: "Otro" };

/** Sin acentos y en minúsculas, para comparar nombres. */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Material sugerido para un grupo de piezas:
 * 1. el nombre de la pieza contiene la primera palabra del material (Carton_Frente → Cartón piedra);
 * 2. piezas curvas o paneles (más de 15 cm de ancho): el tablero o la lámina cuyo espesor coincide (±0,6 mm);
 *    si hay varios, el primero del catálogo;
 * 3. si no, el primer listón (madera maciza): las piezas rectas y angostas son de madera.
 */
export function suggestMaterial(g: Pick<PieceGroup, "names" | "dims" | "curved">, catalog: Material[]): string | null {
  const names = g.names.map(fold).join(" ");
  const byName = catalog.find((m) => {
    const word = fold(m.name).split(/\s+/)[0];
    return word.length >= 4 && names.includes(word);
  });
  if (byName) return byName.id;
  const thick = g.dims[2];
  const panel = g.curved || g.dims[1] > 150;
  const sheet = panel && catalog.find((m) => (m.kind === "tablero" || m.kind === "lamina") && m.thickness != null && Math.abs(m.thickness - thick) <= 0.6);
  if (sheet) return sheet.id;
  return catalog.find((m) => m.kind === "liston")?.id ?? null;
}

/** Asigna a cada nombre de pieza del grupo el mismo material (o lo quita con null). */
export function assignGroup(map: MaterialMap, names: string[], materialId: string | null): MaterialMap {
  const next = { ...map };
  for (const n of names) {
    if (materialId) next[n] = materialId;
    else delete next[n];
  }
  return next;
}

export type MaterialTotal = {
  material: Material | null;
  /** Piezas */
  qty: number;
  /** Cantidad de material: m² (tablero, lámina), metros (listón) o unidades (otro) */
  amount: number;
  unit: "m²" | "m" | "u";
};

/**
 * Totales por material. Tableros: largo × ancho de cada pieza (la pieza curva, su rectángulo envolvente).
 * Láminas: si la pieza es curva, la superficie de una cara (el forro desarrollado); si no, largo × ancho.
 * Listones: metros lineales. Sin material: solo piezas.
 */
export function materialTotals(groups: PieceGroup[], catalog: Material[]): MaterialTotal[] {
  const out = new Map<string, MaterialTotal>();
  for (const g of groups) {
    const material = catalog.find((m) => m.id === g.materialId) ?? null;
    const key = material?.id ?? "";
    const kind = material?.kind ?? "otro";
    const unit = kind === "liston" ? "m" : kind === "otro" ? "u" : "m²";
    const [l, w] = g.dims;
    const each = kind === "liston" ? l / 1000 : kind === "otro" ? 1 : (kind === "lamina" && g.curved ? g.face : l * w) / 1e6;
    const t = out.get(key) ?? { material, qty: 0, amount: 0, unit };
    t.qty += g.qty;
    t.amount += each * g.qty;
    out.set(key, t);
  }
  // en el orden del catálogo; las piezas sin material al final
  return [...out.values()].sort((a, b) => (a.material ? catalog.indexOf(a.material) : 1e9) - (b.material ? catalog.indexOf(b.material) : 1e9));
}

export function formatAmount(t: Pick<MaterialTotal, "amount" | "unit">) {
  const n = t.unit === "u" ? String(Math.round(t.amount)) : t.amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n} ${t.unit}`;
}

/** Color de cada cuerpo según su material (gris claro si no tiene). */
export function materialBodyColors(groups: PieceGroup[], bodyGroup: number[], catalog: Material[]) {
  return bodyGroup.map((g) => catalog.find((m) => m.id === groups[g].materialId)?.color ?? "#e5e5e5");
}
