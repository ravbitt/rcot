// Limpieza de los segmentos de una vista: sin repetidos y sin líneas ocultas debajo de las visibles.
//
// En un modelo simétrico, las aristas del lado lejano (ocultas) caen exactamente sobre las del lado
// cercano (visibles). Lo visible manda: un tramo oculto que coincide con una línea visible se quita,
// aunque se superpongan solo en parte.

type Seg = [number, number, number, number];

const r2 = (x: number) => Math.round(x * 100) / 100;
const ANG_Q = 1e4; // cuantización del ángulo (rad)
const OFF_TOL = 0.06; // mm: dos rectas paralelas a menos de esto son la misma
const MIN_LEN = 0.3; // mm: restos más cortos se descartan

function lineOf(s: Seg) {
  let ux = s[2] - s[0], uy = s[3] - s[1];
  const L = Math.hypot(ux, uy);
  if (L < 1e-9) return null;
  ux /= L;
  uy /= L;
  if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)) {
    ux = -ux;
    uy = -uy;
  }
  const off = -uy * s[0] + ux * s[1];
  const t0 = ux * s[0] + uy * s[1], t1 = ux * s[2] + uy * s[3];
  return { ux, uy, off, ang: Math.round(Math.atan2(uy, ux) * ANG_Q), t0: Math.min(t0, t1), t1: Math.max(t0, t1) };
}

function dedupe(segs: Seg[]) {
  const seen = new Set<string>();
  const out: Seg[] = [];
  for (const s of segs) {
    const q = s.map(r2) as Seg;
    const k1 = q.join(","), k2 = [q[2], q[3], q[0], q[1]].join(",");
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1);
    out.push(q);
  }
  return out;
}

/** Visibles sin repetir; ocultos sin repetir y recortados donde coinciden con una visible. */
export function cleanSegments(visible: Seg[], hidden: Seg[]): { visible: Seg[]; hidden: Seg[] } {
  const vis = dedupe(visible);
  // Índice de las visibles por recta: ángulo y desplazamiento cuantizados
  const index = new Map<string, { off: number; t0: number; t1: number }[]>();
  for (const s of vis) {
    const l = lineOf(s);
    if (!l) continue;
    const k = `${l.ang}|${Math.round(l.off / OFF_TOL)}`;
    const arr = index.get(k);
    if (arr) arr.push(l);
    else index.set(k, [l]);
  }
  const hid: Seg[] = [];
  for (const s of dedupe(hidden)) {
    const l = lineOf(s);
    if (!l) continue;
    const ok = Math.round(l.off / OFF_TOL);
    const cover: [number, number][] = [];
    for (const da of [-1, 0, 1]) {
      for (const dk of [-1, 0, 1]) {
        for (const v of index.get(`${l.ang + da}|${ok + dk}`) ?? []) {
          if (Math.abs(v.off - l.off) <= OFF_TOL) cover.push([v.t0, v.t1]);
        }
      }
    }
    if (!cover.length) {
      hid.push(s);
      continue;
    }
    cover.sort((a, b) => a[0] - b[0]);
    // Resta los intervalos visibles del oculto
    let pieces: [number, number][] = [[l.t0, l.t1]];
    for (const [c0, c1] of cover) {
      pieces = pieces.flatMap(([p0, p1]): [number, number][] => {
        if (c1 <= p0 || c0 >= p1) return [[p0, p1]];
        const out: [number, number][] = [];
        if (c0 > p0) out.push([p0, c0]);
        if (c1 < p1) out.push([c1, p1]);
        return out;
      });
    }
    for (const [p0, p1] of pieces) {
      if (p1 - p0 < MIN_LEN) continue;
      const at = (t: number) => [l.ux * t - l.uy * l.off, l.uy * t + l.ux * l.off];
      hid.push([...at(p0), ...at(p1)].map(r2) as Seg);
    }
  }
  return { visible: vis, hidden: hid };
}
