// Proyección de vistas para los planos: aristas visibles y ocultas del modelo vistas desde una dirección.
//
// 1. Se toman las aristas de contorno de cada pieza y, para esta dirección, las de silueta
//    (donde una cara mira a la cámara y la vecina no: el borde aparente de las piezas curvas).
// 2. Se renderiza un mapa de profundidad del modelo con cámara ortográfica.
// 3. Cada arista se recorre en pasos de ~1 píxel: un tramo es visible si su profundidad no está
//    detrás de lo que hay dibujado en ese píxel. Los tramos seguidos se juntan en segmentos.

import * as THREE from "three";
import { bodyEdges, dot, type Body, type Edge } from "@/lib/geometry/mesh";
import type { Vec3, ViewKind } from "@/lib/types";

export type Projection = {
  visible: number[];
  hidden: number[];
  bounds: [number, number, number, number];
};

/** Dirección hacia la que mira la cámara y su «arriba». Frente del mueble en −Y, Z hacia arriba. */
export const VIEW_DIRS: Record<ViewKind, { dir: Vec3; up: Vec3; label: string }> = {
  iso: { dir: [1, 1, -1], up: [0, 0, 1], label: "Isométrica" },
  "iso-back": { dir: [-1, -1, -1], up: [0, 0, 1], label: "Isométrica posterior" },
  front: { dir: [0, 1, 0], up: [0, 0, 1], label: "Vista frontal" },
  back: { dir: [0, -1, 0], up: [0, 0, 1], label: "Vista posterior" },
  right: { dir: [-1, 0, 0], up: [0, 0, 1], label: "Vista lateral derecha" },
  left: { dir: [1, 0, 0], up: [0, 0, 1], label: "Vista lateral izquierda" },
  top: { dir: [0, 0, -1], up: [0, 1, 0], label: "Vista superior" },
};

const edgeCache = new WeakMap<Body, Edge[]>();
const edgesOf = (b: Body) => {
  let e = edgeCache.get(b);
  if (!e) edgeCache.set(b, (e = bodyEdges(b)));
  return e;
};

/** Base de la vista: u a la derecha, v hacia arriba, d hacia el fondo. */
export function viewBasis(kind: ViewKind) {
  const { dir, up } = VIEW_DIRS[kind];
  const d = new THREE.Vector3(...dir).normalize();
  const u = new THREE.Vector3().crossVectors(d, new THREE.Vector3(...up)).normalize();
  const v = new THREE.Vector3().crossVectors(u, d).normalize();
  return { u, v, d };
}

const DEPTH_VS = /* glsl */ `
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const DEPTH_FS = /* glsl */ `
  void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }
`;

export function projectView(bodies: Body[], kind: ViewKind, opts: { maxPixels?: number } = {}): Projection {
  const { u, v, d } = viewBasis(kind);
  const dArr: Vec3 = [d.x, d.y, d.z];

  // Caja de la vista: proyección de todos los vértices
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity, minD = Infinity, maxD = -Infinity;
  const tmp = new THREE.Vector3();
  for (const b of bodies) {
    const P = b.positions;
    for (let i = 0; i < P.length; i += 3) {
      tmp.set(P[i], P[i + 1], P[i + 2]);
      const pu = tmp.dot(u), pv = tmp.dot(v), pd = tmp.dot(d);
      if (pu < minU) minU = pu;
      if (pu > maxU) maxU = pu;
      if (pv < minV) minV = pv;
      if (pv > maxV) maxV = pv;
      if (pd < minD) minD = pd;
      if (pd > maxD) maxD = pd;
    }
  }
  if (!Number.isFinite(minU)) return { visible: [], hidden: [], bounds: [0, 0, 0, 0] };

  // Cámara ortográfica alineada con la vista, con un margen
  const margin = Math.max(maxU - minU, maxV - minV) * 0.02 + 1;
  const left = minU - margin, right = maxU + margin, bottom = minV - margin, top = maxV + margin;
  const maxPx = opts.maxPixels ?? 3000;
  const pxPerMm = Math.min(maxPx / (right - left), maxPx / (top - bottom), 8);
  const W = Math.max(64, Math.ceil((right - left) * pxPerMm));
  const H = Math.max(64, Math.ceil((top - bottom) * pxPerMm));
  const depthSpan = maxD - minD;
  const near = 1, far = depthSpan + 2;

  const camera = new THREE.OrthographicCamera(left, right, top, bottom, near, far);
  // La cámara está antes del modelo sobre −d; su sistema local tiene x=u, y=v, z=−d.
  const eyeD = minD - 1;
  camera.position.copy(d.clone().multiplyScalar(eyeD));
  camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, d.clone().negate()));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  // Mapa de profundidad
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({ vertexShader: DEPTH_VS, fragmentShader: DEPTH_FS, side: THREE.DoubleSide });
  const geoms: THREE.BufferGeometry[] = [];
  for (const b of bodies) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(b.positions, 3));
    g.setIndex(new THREE.BufferAttribute(b.indices, 1));
    geoms.push(g);
    scene.add(new THREE.Mesh(g, mat));
  }
  renderer.setRenderTarget(target);
  renderer.setClearColor(new THREE.Color(1, 0, 0), 1);
  renderer.clear();
  renderer.render(scene, camera);
  const buf = new Float32Array(W * H * 4);
  renderer.readRenderTargetPixels(target, 0, 0, W, H, buf);
  renderer.setRenderTarget(null);
  target.dispose();
  mat.dispose();
  geoms.forEach((g) => g.dispose());
  renderer.dispose();
  renderer.forceContextLoss();

  // Profundidad mínima y máxima (sin fondo) en un vecindario de 3×3: los bordes caen entre píxeles,
  // y en caras casi de canto la profundidad cambia mucho de un píxel al siguiente.
  const neigh = (px: number, py: number) => {
    let lo = 1, hi = 0;
    for (let oy = -1; oy <= 1; oy++) {
      const y = py + oy;
      if (y < 0 || y >= H) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const x = px + ox;
        if (x < 0 || x >= W) continue;
        const z = buf[(y * W + x) * 4];
        if (z < lo) lo = z;
        if (z < 0.99999 && z > hi) hi = z;
      }
    }
    return { lo, hi: Math.max(hi, lo) };
  };
  // Tolerancia: 0,6 mm de profundidad más una fracción de la pendiente local de la superficie
  const eps = 0.6 / (far - near);
  // Tramos de menos de MIN_RUN muestras se consideran ruido y toman el valor del tramo vecino
  const MIN_RUN = 3;

  const visible: number[] = [];
  const hidden: number[] = [];
  const seen = new Set<string>();
  const push = (out: number[], a: [number, number], b: [number, number]) => {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) return;
    const r = (x: number) => Math.round(x * 100) / 100;
    const s = [r(a[0]), r(a[1]), r(b[0]), r(b[1])];
    const k1 = s.join(",");
    const k2 = [s[2], s[3], s[0], s[1]].join(",");
    if (seen.has(k1) || seen.has(k2)) return;
    seen.add(k1);
    out.push(...s);
  };

  const A = new THREE.Vector3(), B = new THREE.Vector3(), Pt = new THREE.Vector3();
  for (const body of bodies) {
    for (const e of edgesOf(body)) {
      let use = e.feature;
      if (!use && e.n2) {
        // silueta: una cara de frente y la otra de espaldas a la cámara
        const s1 = dot(e.n1, dArr), s2 = dot(e.n2, dArr);
        use = (s1 < 0 && s2 >= 0) || (s1 >= 0 && s2 < 0);
      }
      if (!use) continue;
      A.set(...e.a);
      B.set(...e.b);
      const a2: [number, number] = [A.dot(u), A.dot(v)];
      const b2: [number, number] = [B.dot(u), B.dot(v)];
      const lenPx = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) * pxPerMm;
      const n = Math.max(2, Math.ceil(lenPx / 1.2));
      const vis: boolean[] = [];
      for (let i = 0; i <= n; i++) {
        Pt.lerpVectors(A, B, i / n).project(camera);
        const px = Math.floor(((Pt.x + 1) / 2) * W);
        const py = Math.floor(((Pt.y + 1) / 2) * H);
        const z = Pt.z * 0.5 + 0.5;
        const { lo, hi } = neigh(px, py);
        vis.push(z <= lo + eps + (hi - lo) * 0.75);
      }
      // Limpieza: los tramos muy cortos (parpadeo en superficies rasantes) se unen al vecino
      const runs: { v: boolean; s: number; e: number }[] = [];
      for (let i = 0; i < vis.length; i++) {
        const last = runs[runs.length - 1];
        if (last && last.v === vis[i]) last.e = i;
        else runs.push({ v: vis[i], s: i, e: i });
      }
      for (let k = 0; k < runs.length; k++) {
        const r = runs[k];
        if (runs.length > 1 && r.e - r.s + 1 < MIN_RUN) r.v = k > 0 ? runs[k - 1].v : runs[k + 1].v;
      }
      const merged: { v: boolean; s: number; e: number }[] = [];
      for (const r of runs) {
        const last = merged[merged.length - 1];
        if (last && last.v === r.v) last.e = r.e;
        else merged.push({ ...r });
      }
      const at = (t: number): [number, number] => [a2[0] + (b2[0] - a2[0]) * t, a2[1] + (b2[1] - a2[1]) * t];
      for (let k = 0; k < merged.length; k++) {
        const r = merged[k];
        const t0 = k === 0 ? 0 : (r.s - 0.5) / n;
        const t1 = k === merged.length - 1 ? 1 : (r.e + 0.5) / n;
        push(r.v ? visible : hidden, at(t0), at(t1));
      }
    }
  }

  return { visible, hidden, bounds: [minU, minV, maxU, maxV] };
}

/** Puntos «imán» de una vista: extremos de los segmentos visibles y ocultos (sin repetir). */
export function viewSnapPoints(visible: number[], hidden: number[]) {
  const pts = new Map<string, [number, number]>();
  for (const arr of [visible, hidden]) {
    for (let i = 0; i < arr.length; i += 2) pts.set(`${arr[i]},${arr[i + 1]}`, [arr[i], arr[i + 1]]);
  }
  return [...pts.values()];
}
