// Malla del modelo en el navegador: decodificación y aristas (contornos) de cada pieza.

import type { MeshData, Vec3 } from "@/lib/types";

export type Body = {
  name: string;
  positions: Float32Array;
  indices: Uint32Array;
};

/**
 * Arista de la malla soldada: dos vértices y las normales de las caras que la comparten.
 * `n2` es null en un borde abierto (solo una cara).
 */
export type Edge = {
  a: Vec3;
  b: Vec3;
  n1: Vec3;
  n2: Vec3 | null;
  /** true si el ángulo entre caras supera el umbral (arista «real» del sólido, no de la teselación) */
  feature: boolean;
};

function fromB64<T extends Float32Array | Uint32Array>(s: string, Ctor: new (b: ArrayBuffer) => T): T {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Ctor(bytes.buffer);
}

export function decodeMesh(data: MeshData): Body[] {
  return data.bodies.map((b) => ({
    name: b.name,
    positions: fromB64(b.positions, Float32Array),
    indices: fromB64(b.indices, Uint32Array),
  }));
}

export async function fetchMesh(url: string): Promise<{ data: MeshData; bodies: Body[] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar el modelo (${res.status})`);
  const data = (await res.json()) as MeshData;
  return { data, bodies: decodeMesh(data) };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/**
 * Suelda los vértices por posición (la teselación de OpenCascade repite vértices por cara) y devuelve
 * todas las aristas con las normales de sus caras. Las aristas con ángulo > `featureDeg` son de contorno.
 */
export function bodyEdges(body: Body, featureDeg = 20): Edge[] {
  const { positions: P, indices: I } = body;
  const key = (i: number) => `${Math.round(P[i * 3] * 1000)},${Math.round(P[i * 3 + 1] * 1000)},${Math.round(P[i * 3 + 2] * 1000)}`;
  const weld = new Map<string, number>();
  const ids = new Uint32Array(P.length / 3);
  const verts: Vec3[] = [];
  for (let i = 0; i < ids.length; i++) {
    const k = key(i);
    let id = weld.get(k);
    if (id === undefined) {
      id = verts.length;
      weld.set(k, id);
      verts.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    }
    ids[i] = id;
  }
  const edges = new Map<string, { a: number; b: number; n: Vec3[] }>();
  for (let t = 0; t < I.length; t += 3) {
    const v = [ids[I[t]], ids[I[t + 1]], ids[I[t + 2]]];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    const n = norm(cross(sub(verts[v[1]], verts[v[0]]), sub(verts[v[2]], verts[v[0]])));
    for (let k = 0; k < 3; k++) {
      const a = Math.min(v[k], v[(k + 1) % 3]);
      const b = Math.max(v[k], v[(k + 1) % 3]);
      const ek = `${a}_${b}`;
      const e = edges.get(ek);
      if (e) e.n.push(n);
      else edges.set(ek, { a, b, n: [n] });
    }
  }
  const cosT = Math.cos((featureDeg * Math.PI) / 180);
  const out: Edge[] = [];
  for (const e of edges.values()) {
    const n1 = e.n[0];
    const n2 = e.n.length === 2 ? e.n[1] : null;
    out.push({ a: verts[e.a], b: verts[e.b], n1, n2, feature: !n2 || e.n.length > 2 || dot(n1, n2) < cosT });
  }
  return out;
}

/** Vértices de las aristas de contorno: los puntos «imán» para medir. */
export function featureVertices(edges: Edge[]): Vec3[] {
  const seen = new Map<string, Vec3>();
  for (const e of edges) {
    if (!e.feature) continue;
    for (const p of [e.a, e.b]) seen.set(`${Math.round(p[0] * 100)},${Math.round(p[1] * 100)},${Math.round(p[2] * 100)}`, p);
  }
  return [...seen.values()];
}

export { cross, dot, norm, sub };
