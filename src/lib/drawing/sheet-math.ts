// Conversión entre coordenadas de una vista (mm del modelo, v hacia arriba) y del papel (mm, y hacia abajo).

import type { SheetData, SheetView, Vec2 } from "@/lib/types";
import { SHEET_SIZES } from "@/lib/types";

export const MARGIN = 10;
export const TITLE_W = 180;
export const TITLE_H = 36;

export function viewCenter(view: SheetView): Vec2 {
  const [a, b, c, d] = view.bounds;
  return [(a + c) / 2, (b + d) / 2];
}

export function viewToPaper(view: SheetView, p: Vec2): Vec2 {
  const [cu, cv] = viewCenter(view);
  return [view.x + (p[0] - cu) / view.scale, view.y - (p[1] - cv) / view.scale];
}

export function paperToView(view: SheetView, p: Vec2): Vec2 {
  const [cu, cv] = viewCenter(view);
  return [cu + (p[0] - view.x) * view.scale, cv - (p[1] - view.y) * view.scale];
}

/** Rectángulo de la vista sobre el papel: [x, y, ancho, alto] */
export function viewRect(view: SheetView): [number, number, number, number] {
  const [a, b, c, d] = view.bounds;
  const w = (c - a) / view.scale;
  const h = (d - b) / view.scale;
  return [view.x - w / 2, view.y - h / 2, w, h];
}

export function sheetSize(data: SheetData): Vec2 {
  return SHEET_SIZES[data.size];
}

/** Escala para el rótulo: la común de las vistas ortográficas, o «Indicada». */
export function scaleLabel(data: SheetData) {
  const scales = [...new Set(data.views.filter((v) => !v.kind.startsWith("iso")).map((v) => v.scale))];
  if (scales.length === 1) return `1:${scales[0]}`;
  if (scales.length === 0 && data.views.length) return `1:${data.views[0].scale}`;
  return scales.length ? "Indicada" : "—";
}

/** Escalas normalizadas de dibujo técnico. */
export const SCALES = [1, 2, 2.5, 5, 10, 15, 20, 25, 50, 100];

/** Mayor escala normalizada con la que una caja de w×h mm del modelo cabe en w2×h2 mm de papel. */
export function fitScale(w: number, h: number, maxW: number, maxH: number) {
  for (const s of SCALES) if (w / s <= maxW && h / s <= maxH) return s;
  return SCALES[SCALES.length - 1];
}
