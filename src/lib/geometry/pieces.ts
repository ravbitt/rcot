// Despiece: agrupa las piezas iguales del modelo y les da marca, color y medidas.
//
// Medidas de cada pieza: caja orientada según sus caras planas más grandes (una tabla inclinada o una
// cuña miden lo que mide la tabla, no su caja en los ejes del mundo). Dos piezas son iguales si tienen
// las mismas medidas (±0,5 mm) y el mismo volumen (distingue una escuadra triangular de un taco).

import type { PieceRow, Vec3 } from "@/lib/types";
import { cross, dot, norm, sub, type Body } from "./mesh";

export type PieceGroup = PieceRow & { bodies: number[]; names: string[] };

/** Nombre base: quita los sufijos de posición o número (Pata_FI → Pata, BandaAlta_Lat_I → BandaAlta Lat). */
export function baseName(name: string) {
  let n = name.trim();
  const SUFFIX = /_(?:[IDABFTM]{1,2}|\d+)$/;
  while (SUFFIX.test(n)) n = n.replace(SUFFIX, "");
  return (n || name).replace(/_/g, " ");
}

/** Color de la marca i: tonos repartidos con el ángulo áureo, claros para que las líneas negras se lean encima. */
export function pieceColor(i: number) {
  const h = (i * 137.508 + 25) % 360;
  const s = 0.62;
  const l = i % 2 ? 0.66 : 0.58;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** A, B, …, Z, AA, AB, … */
export function markFor(i: number) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Medidas (largo ≥ ancho ≥ espesor) y volumen de una pieza. */
export function bodyMeasure(body: Body): { dims: [number, number, number]; volume: number } {
  const P = body.positions;
  const I = body.indices;
  const v = (i: number): Vec3 => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  // Área por dirección de normal (n y −n cuentan como el mismo eje)
  const clusters: { n: Vec3; area: number }[] = [];
  let volume = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = v(I[t]), b = v(I[t + 1]), c = v(I[t + 2]);
    const cr = cross(sub(b, a), sub(c, a));
    const area = Math.hypot(...cr) / 2;
    volume += dot(a, cross(b, c)) / 6;
    if (area < 1e-9) continue;
    let n = norm(cr);
    if (n[0] < -1e-9 || (Math.abs(n[0]) <= 1e-9 && (n[1] < -1e-9 || (Math.abs(n[1]) <= 1e-9 && n[2] < 0)))) n = [-n[0], -n[1], -n[2]];
    const hit = clusters.find((cl) => dot(cl.n, n) > 0.9995);
    if (hit) hit.area += area;
    else clusters.push({ n, area });
  }
  clusters.sort((a, b) => b.area - a.area);
  const e1 = norm(clusters[0]?.n ?? [0, 0, 1]);
  const extents = (axes: Vec3[]) => {
    const lo = axes.map(() => Infinity), hi = axes.map(() => -Infinity);
    for (let i = 0; i < P.length / 3; i++) {
      const p = v(i);
      axes.forEach((ax, k) => {
        const q = dot(p, ax);
        lo[k] = Math.min(lo[k], q);
        hi[k] = Math.max(hi[k], q);
      });
    }
    return axes.map((_, k) => hi[k] - lo[k]);
  };
  // Segundo eje: entre las normales perpendiculares a e1 (y, si no hay, el eje del mundo menos alineado),
  // la que da el rectángulo de menor área; si empatan, el más cuadrado (una escuadra: sus catetos, no la hipotenusa).
  const candidates: Vec3[] = clusters.filter((c) => Math.abs(dot(c.n, e1)) < 0.02).map((c) => norm(c.n));
  if (!candidates.length) {
    const axes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const w = axes.reduce((best, ax) => (Math.abs(dot(ax, e1)) < Math.abs(dot(best, e1)) ? ax : best));
    candidates.push(norm(cross(e1, w)));
  }
  let best: [number, number, number] | null = null;
  let bestArea = Infinity, bestLong = Infinity;
  for (const e2 of candidates) {
    const [a1, a2, a3] = extents([e1, e2, norm(cross(e1, e2))]);
    const area = a2 * a3, long = Math.max(a2, a3);
    if (area < bestArea * 0.99 || (area <= bestArea * 1.01 && long < bestLong - 1e-6)) {
      bestArea = area;
      bestLong = long;
      best = [a1, a2, a3];
    }
  }
  const d = [...best!].sort((a, b) => b - a) as [number, number, number];
  return { dims: d, volume: Math.abs(volume) };
}

/** Agrupa las piezas iguales. Devuelve los grupos (ordenados por tamaño) y el grupo de cada cuerpo. */
export function groupPieces(bodies: Body[]): { groups: PieceGroup[]; bodyGroup: number[] } {
  const r = (x: number) => Math.round(x * 2) / 2;
  const map = new Map<string, { dims: [number, number, number]; bodies: number[]; names: string[] }>();
  bodies.forEach((b, i) => {
    const m = bodyMeasure(b);
    const dims = m.dims.map(r) as [number, number, number];
    // volumen en cm³ redondeado: separa formas distintas con la misma caja
    const key = `${dims.join("x")}|${Math.round(m.volume / 1000)}`;
    const g = map.get(key);
    if (g) {
      g.bodies.push(i);
      g.names.push(b.name);
    } else map.set(key, { dims, bodies: [i], names: [b.name] });
  });
  const list = [...map.values()].sort((a, b) => b.dims[0] - a.dims[0] || b.dims[1] - a.dims[1] || b.dims[2] - a.dims[2]);
  const bodyGroup = new Array<number>(bodies.length).fill(0);
  const groups: PieceGroup[] = list.map((g, i) => {
    g.bodies.forEach((bi) => (bodyGroup[bi] = i));
    const bases = [...new Set(g.names.map(baseName))];
    return {
      mark: markFor(i),
      name: bases.slice(0, 3).join(", ") + (bases.length > 3 ? "…" : ""),
      qty: g.bodies.length,
      dims: g.dims,
      color: pieceColor(i),
      bodies: g.bodies,
      names: g.names,
    };
  });
  return { groups, bodyGroup };
}

/** Filas para la tabla (sin los índices de cuerpos). */
export function toRows(groups: PieceGroup[]): PieceRow[] {
  return groups.map(({ mark, name, qty, dims, color }) => ({ mark, name, qty, dims, color }));
}
