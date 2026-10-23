// Claves de piezas en una vista: globos con la marca del despiece, ubicados alrededor de la vista.

import type { Vec2 } from "@/lib/types";

export type MarkSeed = { mark: string; color: string; anchor: Vec2 };

/**
 * Ubica los globos alrededor de la vista, como en un plano de armado: cada uno va al lado de la caja
 * más cercano a su pieza, a `margin` del borde; en cada lado se ordenan según la posición de su pieza
 * (así las líneas guía no se cruzan) y se separan lo justo para no pisarse.
 * Todo en coordenadas de la vista (mm del modelo); `radius` y `margin` también.
 */
export function placeMarks(seeds: MarkSeed[], bounds: [number, number, number, number], radius: number, margin: number): Vec2[] {
  const [x0, y0, x1, y1] = bounds;
  const gap = radius * 2.4;
  type Side = "left" | "right" | "bottom" | "top";
  const sideOf = (a: Vec2): Side => {
    const d: [Side, number][] = [
      ["left", a[0] - x0],
      ["right", x1 - a[0]],
      // los lados horizontales son más largos: se prefieren levemente
      ["bottom", (a[1] - y0) * 0.85],
      ["top", (y1 - a[1]) * 0.85],
    ];
    return d.sort((p, q) => p[1] - q[1])[0][0];
  };
  const out: Vec2[] = new Array(seeds.length);
  const groups = new Map<Side, number[]>();
  seeds.forEach((s, i) => {
    const side = sideOf(s.anchor);
    groups.set(side, [...(groups.get(side) ?? []), i]);
  });
  for (const [side, idx] of groups) {
    const horiz = side === "top" || side === "bottom";
    // coordenada a lo largo del lado y posición fija del lado
    const along = (i: number) => (horiz ? seeds[i].anchor[0] : seeds[i].anchor[1]);
    const fixed = side === "left" ? x0 - margin : side === "right" ? x1 + margin : side === "bottom" ? y0 - margin : y1 + margin;
    const order = [...idx].sort((i, j) => along(i) - along(j));
    const t = order.map(along);
    // separación mínima: pasada hacia adelante y hacia atrás, y se recentra sobre las piezas
    for (let k = 1; k < t.length; k++) t[k] = Math.max(t[k], t[k - 1] + gap);
    const want = order.map(along);
    const shift = (want.reduce((a, b) => a + b, 0) - t.reduce((a, b) => a + b, 0)) / (t.length || 1);
    for (let k = 0; k < t.length; k++) t[k] += shift;
    for (let k = t.length - 2; k >= 0; k--) t[k] = Math.min(t[k], t[k + 1] - gap);
    order.forEach((i, k) => (out[i] = horiz ? [t[k], fixed] : [fixed, t[k]]));
  }
  return out;
}
