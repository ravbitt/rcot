// Vista explosionada: cada pieza se aleja del centro del modelo en la dirección de su propio centro.
// Con factor f, una pieza cuyo centro está a distancia r del centro del modelo se corre f·r.

import type { Vec3 } from "@/lib/types";
import type { Body } from "./mesh";

function centerOf(positions: Float32Array): Vec3 {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], positions[i + k]);
      hi[k] = Math.max(hi[k], positions[i + k]);
    }
  }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
}

/** Desplazamiento de cada pieza para el factor dado (0 = armado). */
export function explodeOffsets(bodies: Body[], factor: number): Vec3[] {
  if (!factor) return bodies.map(() => [0, 0, 0]);
  const centers = bodies.map((b) => centerOf(b.positions));
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const b of bodies) {
    for (let i = 0; i < b.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], b.positions[i + k]);
        hi[k] = Math.max(hi[k], b.positions[i + k]);
      }
    }
  }
  const C = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
  return centers.map((c) => [(c[0] - C[0]) * factor, (c[1] - C[1]) * factor, (c[2] - C[2]) * factor]);
}

/** Copias de las piezas ya desplazadas (para proyectar planos explosionados). */
export function explodeBodies(bodies: Body[], factor: number): Body[] {
  if (!factor) return bodies;
  const off = explodeOffsets(bodies, factor);
  return bodies.map((b, i) => {
    const p = new Float32Array(b.positions.length);
    for (let j = 0; j < p.length; j += 3) {
      p[j] = b.positions[j] + off[i][0];
      p[j + 1] = b.positions[j + 1] + off[i][1];
      p[j + 2] = b.positions[j + 2] + off[i][2];
    }
    return { name: b.name, positions: p, indices: b.indices };
  });
}
