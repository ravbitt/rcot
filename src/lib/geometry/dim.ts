// Geometría de las cotas: dónde va la línea de cota, sus líneas de extensión y el valor medido.

import type { DimensionAxis, SheetDimOrient, Vec2, Vec3 } from "@/lib/types";

const AXES: Record<Exclude<DimensionAxis, "aligned">, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

export type Dim3DGeometry = {
  /** Extremos de la línea de cota */
  p1: Vec3;
  p2: Vec3;
  /** Dirección de medición (unitaria) */
  dir: Vec3;
  /** Valor medido en mm */
  value: number;
};

/**
 * La línea de cota pasa por `offset` y es paralela a la dirección de medición: la recta entre los puntos
 * (alineada) o un eje del modelo. Sus extremos son las proyecciones de `a` y `b` sobre esa recta.
 */
export function dim3d(a: Vec3, b: Vec3, offset: Vec3, axis: DimensionAxis): Dim3DGeometry | null {
  let dir: Vec3;
  if (axis === "aligned") {
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(...d);
    if (l < 1e-9) return null;
    dir = [d[0] / l, d[1] / l, d[2] / l];
  } else dir = AXES[axis];
  const proj = (p: Vec3): Vec3 => {
    const t = (p[0] - offset[0]) * dir[0] + (p[1] - offset[1]) * dir[1] + (p[2] - offset[2]) * dir[2];
    return [offset[0] + dir[0] * t, offset[1] + dir[1] * t, offset[2] + dir[2] * t];
  };
  const p1 = proj(a);
  const p2 = proj(b);
  return { p1, p2, dir, value: Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) };
}

export type Dim2DGeometry = { p1: Vec2; p2: Vec2; dir: Vec2; normal: Vec2; value: number };

/** Cota 2D: horizontal, vertical o alineada; `offset` es la distancia (con signo) de la línea de cota a `a`. */
export function dim2d(a: Vec2, b: Vec2, orient: SheetDimOrient, offset: number): Dim2DGeometry | null {
  let dir: Vec2;
  if (orient === "h") dir = [1, 0];
  else if (orient === "v") dir = [0, 1];
  else {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-9) return null;
    dir = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  }
  const normal: Vec2 = [-dir[1], dir[0]];
  const c = a[0] * normal[0] + a[1] * normal[1] + offset; // posición de la línea de cota sobre la normal
  const onLine = (p: Vec2): Vec2 => {
    const s = c - (p[0] * normal[0] + p[1] * normal[1]);
    return [p[0] + normal[0] * s, p[1] + normal[1] * s];
  };
  const p1 = onLine(a);
  const p2 = onLine(b);
  return { p1, p2, dir, normal, value: Math.abs((p2[0] - p1[0]) * dir[0] + (p2[1] - p1[1]) * dir[1]) };
}

/** Formatea un valor en mm con la unidad pedida y coma decimal (75 · 2,5). Sin ceros sobrantes. */
export function formatLength(mm: number, unit: "mm" | "cm", decimals: number) {
  const v = unit === "cm" ? mm / 10 : mm;
  const fixed = v.toFixed(decimals);
  const trimmed = decimals > 0 ? fixed.replace(/\.?0+$/, "") : fixed;
  return trimmed.replace(".", ",");
}

// ── Arcos, radios y ángulos (cotas 2D) ─────────────────────────────────

/** Circunferencia que pasa por tres puntos, o null si están alineados. */
export function circle3(a: Vec2, b: Vec2, c: Vec2): { center: Vec2; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  const scale = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - a[0], c[1] - a[1]), 1e-9);
  if (Math.abs(d) < 1e-9 * scale * scale) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { center: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
}

const TAU = Math.PI * 2;
const wrap = (x: number) => ((x % TAU) + TAU) % TAU;

/**
 * Barrido (radianes, con signo: positivo antihorario) del arco de centro `c` que va de `a` a `b`
 * pasando por `m`.
 */
export function arcSweep(c: Vec2, a: Vec2, m: Vec2, b: Vec2) {
  const ta = Math.atan2(a[1] - c[1], a[0] - c[0]);
  const tm = Math.atan2(m[1] - c[1], m[0] - c[0]);
  const tb = Math.atan2(b[1] - c[1], b[0] - c[0]);
  const s = wrap(tb - ta);
  return wrap(tm - ta) <= s ? s : s - TAU;
}

/** Ángulo (radianes, 0..π) en el vértice `v` entre las semirrectas hacia `p1` y `p2`. */
export function angleAt(v: Vec2, p1: Vec2, p2: Vec2) {
  const a1 = Math.atan2(p1[1] - v[1], p1[0] - v[0]);
  const a2 = Math.atan2(p2[1] - v[1], p2[0] - v[0]);
  const d = Math.abs(wrap(a2 - a1));
  return d > Math.PI ? TAU - d : d;
}

/** Ángulo en grados con coma decimal y sin ceros sobrantes (45° · 22,5°). */
export function formatAngle(rad: number, decimals = 1) {
  const deg = (rad * 180) / Math.PI;
  return `${deg.toFixed(decimals).replace(/\.?0+$/, "").replace(".", ",")}°`;
}
