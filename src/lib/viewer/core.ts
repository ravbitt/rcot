// Visor 3D (three.js): modelo, aristas, imán a vértices/aristas y cotas.
// Sin React: el componente <ModelViewer> lo crea y le pasa los cambios.

import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { arcSweep, circle3d, dim3d, dimension3dText, formatLength, fromPlane, onPlane } from "@/lib/geometry/dim";
import { explodeOffsets } from "@/lib/geometry/explode";
import { bodyEdges, type Body, type Edge } from "@/lib/geometry/mesh";
import type { Dimension, DimensionAxis, DimensionKind, Vec2, Vec3 } from "@/lib/types";

export type SnapKind = "vertex" | "midpoint" | "edge" | "face";
export type Snap = { point: Vec3; kind: SnapKind; body: string };

/** Puntos elegidos de la cota en preparación y cuántos hacen falta (2 lineal, 3 en arcos). */
export type MeasureDraft = { points: Vec3[]; needed: number };

export type ViewerEvents = {
  onHoverBody?: (name: string | null) => void;
  onSelectDimension?: (id: string | null) => void;
  onCreateDimension?: (d: Omit<Dimension, "id">) => void;
  onDraftChange?: (draft: MeasureDraft) => void;
};

const WOOD = 0xd8b88a;
const EDGE = 0x2b2b2b;
const DIM = 0xe8590c;
const DIM_SELECTED = 0x1c7ed6;
const VERTEX_PX = 14;
const EDGE_PX = 9;

const v3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);
const arr = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

type DimVisual = {
  dim: Dimension;
  group: THREE.Group;
  lines: THREE.LineSegments;
  label: CSS2DObject;
};

export class ViewerCore {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private model = new THREE.Group();
  private dimsGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private meshes: THREE.Mesh[] = [];
  /** Malla y aristas de cada pieza (para explosionar) y los datos originales */
  private bodyObjects: THREE.Object3D[][] = [];
  private bodyData: Body[] = [];
  private exploded = 0;
  private edges: { body: string; a: THREE.Vector3; b: THREE.Vector3 }[] = [];
  private vertices: { body: string; p: THREE.Vector3 }[] = [];
  private dims = new Map<string, DimVisual>();
  private selected: string | null = null;
  private marker: CSS2DObject;
  private preview: THREE.LineSegments;
  private previewLabel: CSS2DObject;
  private resizeObs: ResizeObserver;
  private size = 1000;

  private measuring = false;
  private axis: DimensionAxis = "aligned";
  private draft: Vec3[] = [];
  private kind: DimensionKind = "linear";
  private unit: "mm" | "cm" = "cm";
  private decimals = 1;
  private hoverBody: string | null = null;
  private downAt: { x: number; y: number } | null = null;

  constructor(
    private container: HTMLElement,
    private events: ViewerEvents = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xf3f4f6);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.labels = new CSS2DRenderer();
    Object.assign(this.labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    container.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 100000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-1, -2, 3);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(2, 1, -1);
    this.scene.add(fill);
    this.scene.add(this.model, this.dimsGroup);

    const markerEl = document.createElement("div");
    markerEl.className = "snap-marker";
    this.marker = new CSS2DObject(markerEl);
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.preview = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: DIM, depthTest: false, transparent: true, opacity: 0.85 }),
    );
    this.preview.renderOrder = 10;
    this.preview.visible = false;
    this.scene.add(this.preview);
    const pl = document.createElement("div");
    pl.className = "dim-label dim-label--preview";
    this.previewLabel = new CSS2DObject(pl);
    this.previewLabel.visible = false;
    this.scene.add(this.previewLabel);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointerleave", this.onPointerLeave);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.frame);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObs.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointerup", this.onPointerUp);
    el.removeEventListener("pointerleave", this.onPointerLeave);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.renderer.dispose();
    el.remove();
    this.labels.domElement.remove();
  }

  // ── Modelo ────────────────────────────────────────────────────────────

  setModel(bodies: Body[]) {
    this.model.clear();
    this.meshes = [];
    this.bodyObjects = [];
    this.bodyData = bodies;
    this.edges = [];
    const vmap = new Map<string, { body: string; p: THREE.Vector3 }>();
    const mat = new THREE.MeshStandardMaterial({
      color: WOOD,
      roughness: 0.85,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      side: THREE.DoubleSide,
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: EDGE });
    for (const body of bodies) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(body.positions, 3));
      g.setIndex(new THREE.BufferAttribute(body.indices, 1));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = body.name;
      mesh.userData.woodMaterial = mat;
      this.model.add(mesh);
      this.meshes.push(mesh);

      const feat: Edge[] = bodyEdges(body).filter((e) => e.feature);
      const lp = new Float32Array(feat.length * 6);
      feat.forEach((e, i) => lp.set([...e.a, ...e.b], i * 6));
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
      const lines = new THREE.LineSegments(lg, edgeMat);
      lines.name = `${body.name}:edges`;
      lines.userData.body = body.name;
      this.model.add(lines);
      this.bodyObjects.push([mesh, lines]);
      for (const e of feat) {
        const a = v3(e.a);
        const b = v3(e.b);
        this.edges.push({ body: body.name, a, b });
        for (const p of [a, b]) vmap.set(`${body.name}|${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`, { body: body.name, p });
      }
    }
    this.vertices = [...vmap.values()];
    const box = new THREE.Box3().setFromObject(this.model);
    this.size = box.getSize(new THREE.Vector3()).length() || 1000;
    this.fit();
  }

  /** Colorea cada pieza (en el orden de los cuerpos) o vuelve al color madera con `null`. */
  setBodyColors(colors: string[] | null) {
    this.meshes.forEach((m, i) => {
      const shared = m.userData.woodMaterial as THREE.Material;
      if (m.material !== shared) (m.material as THREE.Material).dispose();
      m.material = colors?.[i]
        ? new THREE.MeshStandardMaterial({
            color: colors[i],
            roughness: 0.75,
            metalness: 0,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
            side: THREE.DoubleSide,
          })
        : shared;
    });
  }

  /**
   * Vista explosionada (0 = armado). Las piezas solo se trasladan; las cotas se ocultan porque miden
   * el modelo armado, y el imán de medición queda fuera de uso mientras esté explosionado.
   */
  setExplode(factor: number) {
    this.exploded = factor;
    const off = explodeOffsets(this.bodyData, factor);
    this.bodyObjects.forEach((objs, i) => objs.forEach((o) => o.position.set(...off[i])));
    this.dimsGroup.visible = factor === 0 && this.dimsWanted;
  }

  setHiddenBodies(hidden: Set<string>) {
    this.hidden = hidden;
    for (const o of this.model.children) {
      const name = (o.userData.body as string | undefined) ?? o.name;
      o.visible = !hidden.has(name);
    }
    // CSS2DRenderer no mira la visibilidad del padre: las claves de piezas ocultas se ocultan aparte
    for (const m of this.marks) m.label.visible = !hidden.has(this.bodyData[m.body]?.name);
  }

  // ── Claves de piezas ─────────────────────────────────────────────────

  private hidden = new Set<string>();
  private marks: { body: number; label: CSS2DObject; line: THREE.LineSegments }[] = [];

  /**
   * Globos con la marca del despiece. `groups` son las marcas y colores de cada grupo y `bodyGroup` el
   * grupo de cada cuerpo; con mode «type» se marca una pieza por grupo (la más hacia afuera del modelo).
   * Cada globo es hijo de su pieza: se mueve con ella al explosionar. null quita las claves.
   */
  setPieceMarks(info: { groups: { mark: string; color: string }[]; bodyGroup: number[] } | null, mode: "type" | "all" = "type") {
    for (const m of this.marks) {
      m.label.removeFromParent();
      m.label.element.remove();
      m.line.removeFromParent();
      m.line.geometry.dispose();
    }
    this.marks = [];
    if (!info || !this.bodyData.length) return;
    const box = new THREE.Box3();
    for (const b of this.bodyData) for (let i = 0; i < b.positions.length; i += 3) box.expandByPoint(new THREE.Vector3(b.positions[i], b.positions[i + 1], b.positions[i + 2]));
    const center = box.getCenter(new THREE.Vector3());
    // punto de la superficie de cada pieza: el centro de triángulo más cercano al centro de su caja
    const anchors = this.bodyData.map((b) => {
      const bb = new THREE.Box3();
      for (let i = 0; i < b.positions.length; i += 3) bb.expandByPoint(new THREE.Vector3(b.positions[i], b.positions[i + 1], b.positions[i + 2]));
      const bc = bb.getCenter(new THREE.Vector3());
      let best = bc.clone(), bestD = Infinity;
      const P = b.positions, I = b.indices, q = new THREE.Vector3();
      for (let t = 0; t < I.length; t += 3) {
        q.set(
          (P[I[t] * 3] + P[I[t + 1] * 3] + P[I[t + 2] * 3]) / 3,
          (P[I[t] * 3 + 1] + P[I[t + 1] * 3 + 1] + P[I[t + 2] * 3 + 1]) / 3,
          (P[I[t] * 3 + 2] + P[I[t + 1] * 3 + 2] + P[I[t + 2] * 3 + 2]) / 3,
        );
        // preferimos caras que miran hacia afuera del modelo
        const d = q.distanceTo(bc) - q.distanceTo(center) * 0.15;
        if (d < bestD) {
          bestD = d;
          best = q.clone();
        }
      }
      return best;
    });
    let picked = this.bodyData.map((_, i) => i);
    if (mode === "type") {
      picked = info.groups.map((_, g) => {
        const members = picked.filter((i) => info.bodyGroup[i] === g);
        return members.sort((i, j) => anchors[j].distanceTo(center) - anchors[i].distanceTo(center))[0];
      }).filter((i) => i !== undefined);
    }
    const reach = this.size * 0.14;
    const lineMat = new THREE.LineBasicMaterial({ color: 0x222222, depthTest: false, transparent: true, opacity: 0.85 });
    for (const i of picked) {
      const g = info.groups[info.bodyGroup[i]];
      if (!g) continue;
      const a = anchors[i];
      const dir = a.clone().sub(center);
      if (dir.lengthSq() < 1e-9) dir.set(0, 0, 1);
      dir.normalize();
      // un poco hacia arriba para que los globos no queden bajo el mueble
      dir.z += 0.35;
      dir.normalize();
      const pos = a.clone().addScaledVector(dir, reach);
      const el = document.createElement("div");
      el.className = "mark-balloon";
      el.textContent = g.mark;
      el.style.background = g.color;
      const label = new CSS2DObject(el);
      label.position.copy(pos);
      const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([a, pos]), lineMat);
      line.renderOrder = 4;
      const mesh = this.bodyObjects[i]?.[0];
      if (!mesh) continue;
      mesh.add(label, line);
      label.visible = !this.hidden.has(this.bodyData[i].name);
      this.marks.push({ body: i, label, line });
    }
  }

  /** Encuadra el modelo desde una vista isométrica (frente-izquierda, como en los planos). */
  fit(direction: Vec3 = [-1, -1.3, 0.9]) {
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.05;
    const dir = v3(direction).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = dist / 100;
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
  }

  // ── Cotas ─────────────────────────────────────────────────────────────

  setFormat(unit: "mm" | "cm", decimals: number) {
    this.unit = unit;
    this.decimals = decimals;
    for (const v of this.dims.values()) this.updateDimVisual(v);
  }

  setDimensions(list: Dimension[]) {
    const ids = new Set(list.map((d) => d.id));
    for (const [id, v] of this.dims) {
      if (!ids.has(id)) {
        this.dimsGroup.remove(v.group);
        v.lines.geometry.dispose();
        v.label.element.remove();
        this.dims.delete(id);
      }
    }
    for (const d of list) {
      const existing = this.dims.get(d.id);
      if (existing) {
        existing.dim = d;
        this.updateDimVisual(existing);
        continue;
      }
      const group = new THREE.Group();
      const lines = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: DIM, depthTest: false }),
      );
      lines.renderOrder = 5;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "dim-label";
      el.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
        this.events.onSelectDimension?.(d.id);
      });
      const label = new CSS2DObject(el);
      group.add(lines, label);
      this.dimsGroup.add(group);
      const v: DimVisual = { dim: d, group, lines, label };
      this.dims.set(d.id, v);
      this.updateDimVisual(v);
    }
    this.setSelected(this.selected);
  }

  setSelected(id: string | null) {
    this.selected = id;
    for (const [did, v] of this.dims) {
      const on = did === id;
      (v.lines.material as THREE.LineBasicMaterial).color.setHex(on ? DIM_SELECTED : DIM);
      v.label.element.classList.toggle("dim-label--selected", on);
    }
  }

  private dimsWanted = true;
  setDimensionsVisible(visible: boolean) {
    this.dimsWanted = visible;
    this.dimsGroup.visible = visible && this.exploded === 0;
  }

  private dimText(dim: Pick<Dimension, "label">, value: number) {
    return dim.label?.trim() || formatLength(value, this.unit, this.decimals);
  }

  /** Líneas de una cota: extensión desde los puntos, línea de cota y flechas (en tamaño de pantalla). */
  private dimSegments(a: Vec3, b: Vec3, offset: Vec3, axis: DimensionAxis) {
    const g = dim3d(a, b, offset, axis);
    if (!g) return null;
    const p1 = v3(g.p1);
    const p2 = v3(g.p2);
    const pa = v3(a);
    const pb = v3(b);
    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    const px = this.worldPerPixel(mid);
    const segs: THREE.Vector3[] = [];
    const ext = (from: THREE.Vector3, to: THREE.Vector3) => {
      const d = to.clone().sub(from);
      const len = d.length();
      if (len < 1e-6) return;
      d.normalize();
      // pequeño espacio junto a la pieza y un sobrepaso más allá de la línea de cota
      segs.push(from.clone().addScaledVector(d, Math.min(px * 4, len * 0.2)), to.clone().addScaledVector(d, px * 6));
    };
    ext(pa, p1);
    ext(pb, p2);
    segs.push(p1, p2);
    // flechas: dos trazos en el plano que contiene la línea de cota y mira a la cámara
    const dir = p2.clone().sub(p1);
    if (dir.lengthSq() > 1e-12) {
      dir.normalize();
      const view = this.camera.position.clone().sub(mid).normalize();
      const side = new THREE.Vector3().crossVectors(dir, view).normalize();
      const L = px * 11;
      const W = px * 3.5;
      for (const [tip, s] of [
        [p1, 1],
        [p2, -1],
      ] as const) {
        const base = tip.clone().addScaledVector(dir, L * s);
        segs.push(tip, base.clone().addScaledVector(side, W), tip, base.clone().addScaledVector(side, -W));
      }
    }
    return { segs, mid, value: g.value };
  }

  /**
   * Cotas de arco (radio, diámetro, longitud): todo se dibuja en el plano del arco y se pasa al espacio.
   * `offset` es dónde va el texto (radio/diámetro) o por dónde pasa la cota concéntrica (arco).
   */
  private curvedSegments(d: Pick<Dimension, "kind" | "a" | "b" | "c" | "offset" | "axis" | "label">) {
    if (!d.c) return null;
    const circ = circle3d(d.a, d.c, d.b);
    if (!circ) return null;
    const W3 = (q: Vec2) => v3(fromPlane(circ, q));
    const r = circ.r;
    let P = onPlane(circ, d.offset);
    if (Math.hypot(...P) < 1e-6) P = onPlane(circ, d.c);
    const px = this.worldPerPixel(v3(fromPlane(circ, P)));
    const L = px * 11, Wd = px * 3.5;
    const segs: THREE.Vector3[] = [];
    const line = (p: Vec2, q: Vec2) => segs.push(W3(p), W3(q));
    // flecha con la punta en `tip`, abierta hacia `back` (unitario, en el plano)
    const arrow = (tip: Vec2, back: Vec2) => {
      const base: Vec2 = [tip[0] + back[0] * L, tip[1] + back[1] * L];
      const n: Vec2 = [-back[1], back[0]];
      line(tip, [base[0] + n[0] * Wd, base[1] + n[1] * Wd]);
      line(tip, [base[0] - n[0] * Wd, base[1] - n[1] * Wd]);
    };
    const text = dimension3dText({ ...d, kind: d.kind ?? "linear" }, this.unit, this.decimals)?.text ?? "";
    if (d.kind === "radius" || d.kind === "diameter") {
      const lp = Math.hypot(...P);
      const u: Vec2 = [P[0] / lp, P[1] / lp];
      const Q: Vec2 = [u[0] * r, u[1] * r];
      const outside = lp > r;
      const inward: Vec2 = [-u[0], -u[1]];
      // Con un arco grande respecto del modelo, la cota se dibuja corta: del arco al texto
      const short = r > this.size * 0.6;
      if (short) line(Q, P);
      else {
        const far = outside ? P : Q;
        line(d.kind === "diameter" ? [-u[0] * r, -u[1] * r] : [0, 0], far);
        const k = px * 6;
        line([-k, 0], [k, 0]);
        line([0, -k], [0, k]);
      }
      arrow(Q, outside ? u : inward);
      if (d.kind === "diameter" && !short) arrow([-Q[0], -Q[1]], u);
      return { segs, labelPos: W3(P), text };
    }
    // longitud de arco: cota concéntrica de radio |P| entre los extremos
    const A = onPlane(circ, d.a), M = onPlane(circ, d.c), B = onPlane(circ, d.b);
    const sweep = arcSweep([0, 0], A, M, B);
    const t0 = Math.atan2(A[1], A[0]);
    const Rd = Math.hypot(...P);
    const at = (t: number, rr = Rd): Vec2 => [Math.cos(t) * rr, Math.sin(t) * rr];
    const N = Math.max(12, Math.ceil(Math.abs(sweep) / 0.04));
    for (let i = 0; i < N; i++) line(at(t0 + (sweep * i) / N), at(t0 + (sweep * (i + 1)) / N));
    for (const t of [t0, t0 + sweep]) {
      const dir = Rd >= r ? 1 : -1;
      line(at(t, r + dir * Math.min(px * 4, Math.abs(Rd - r) * 0.2)), at(t, Rd + dir * px * 6));
    }
    const tan = (t: number, s: number): Vec2 => [-Math.sin(t) * s, Math.cos(t) * s];
    const sg = Math.sign(sweep) || 1;
    arrow(at(t0), tan(t0, sg));
    arrow(at(t0 + sweep), tan(t0 + sweep, -sg));
    return { segs, labelPos: W3(at(t0 + sweep / 2, Rd + (Rd >= r ? 1 : -1) * px * 14)), text };
  }

  private updateDimVisual(v: DimVisual) {
    if (v.dim.kind && v.dim.kind !== "linear") {
      const c = this.curvedSegments(v.dim);
      if (!c) return;
      v.lines.geometry.setFromPoints(c.segs);
      v.label.position.copy(c.labelPos);
      v.label.element.textContent = c.text;
      return;
    }
    const r = this.dimSegments(v.dim.a, v.dim.b, v.dim.offset, v.dim.axis);
    if (!r) return;
    v.lines.geometry.setFromPoints(r.segs);
    v.label.position.copy(r.mid);
    v.label.element.textContent = this.dimText(v.dim, r.value);
  }

  private worldPerPixel(at: THREE.Vector3) {
    const h = this.renderer.domElement.clientHeight || 1;
    const dist = this.camera.position.distanceTo(at);
    return (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / h;
  }

  // ── Medición ──────────────────────────────────────────────────────────

  setMeasuring(on: boolean, axis: DimensionAxis, kind: DimensionKind = "linear") {
    this.measuring = on;
    this.axis = axis;
    if (kind !== this.kind) {
      this.kind = kind;
      this.cancelDraft();
    }
    if (!on) this.cancelDraft();
    this.renderer.domElement.style.cursor = on ? "crosshair" : "";
  }

  setAxis(axis: DimensionAxis) {
    this.axis = axis;
  }

  private get needed() {
    return this.kind === "linear" ? 2 : 3;
  }

  cancelDraft() {
    this.draft = [];
    this.preview.visible = false;
    this.previewLabel.visible = false;
    this.events.onDraftChange?.({ points: [], needed: this.needed });
  }

  /** Cota en preparación con los puntos ya elegidos (arcos: inicio, intermedio y final). */
  private draftDimension(offset: Vec3): Omit<Dimension, "id"> {
    const [p0, p1, p2] = this.draft;
    return this.kind === "linear"
      ? { kind: "linear", a: p0, b: p1, offset, axis: this.axis, label: null }
      : { kind: this.kind, a: p0, c: p1, b: p2, offset, axis: "aligned", label: null };
  }

  private mouse(ev: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height };
  }

  private toScreen(p: THREE.Vector3, w: number, h: number) {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, behind: v.z > 1 };
  }

  /** Punto bajo el cursor con imán: vértice, punto medio de arista, arista o cara. */
  snapAt(mx: number, my: number, w: number, h: number): Snap | null {
    const ndc = new THREE.Vector2((mx / w) * 2 - 1, -(my / h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const visible = this.meshes.filter((m) => m.visible);
    const hit = this.raycaster.intersectObjects(visible, false)[0];
    const hitDist = hit ? hit.distance : Infinity;
    const occluded = (p: THREE.Vector3) => {
      if (!hit) return false;
      return this.camera.position.distanceTo(p) > hitDist + this.size * 0.01;
    };
    const visibleBody = (name: string) => visible.some((m) => m.name === name);

    let best: Snap | null = null;
    let bestD = VERTEX_PX;
    for (const v of this.vertices) {
      if (!visibleBody(v.body)) continue;
      const s = this.toScreen(v.p, w, h);
      if (s.behind) continue;
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < bestD && !occluded(v.p)) {
        bestD = d;
        best = { point: arr(v.p), kind: "vertex", body: v.body };
      }
    }
    if (best) return best;

    bestD = EDGE_PX;
    for (const e of this.edges) {
      if (!visibleBody(e.body)) continue;
      const sa = this.toScreen(e.a, w, h);
      const sb = this.toScreen(e.b, w, h);
      if (sa.behind || sb.behind) continue;
      const dx = sb.x - sa.x;
      const dy = sb.y - sa.y;
      const L2 = dx * dx + dy * dy;
      if (L2 < 1) continue;
      const t = Math.max(0, Math.min(1, ((mx - sa.x) * dx + (my - sa.y) * dy) / L2));
      const d = Math.hypot(sa.x + dx * t - mx, sa.y + dy * t - my);
      if (d < bestD) {
        const p = e.a.clone().lerp(e.b, t);
        if (occluded(p)) continue;
        bestD = d;
        const midS = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 };
        const nearMid = Math.hypot(midS.x - mx, midS.y - my) < VERTEX_PX;
        best = nearMid
          ? { point: arr(e.a.clone().lerp(e.b, 0.5)), kind: "midpoint", body: e.body }
          : { point: arr(p), kind: "edge", body: e.body };
      }
    }
    if (best) return best;
    if (hit) return { point: arr(hit.point), kind: "face", body: hit.object.name };
    return null;
  }

  /**
   * Punto de colocación: lineal, el cursor sobre el plano que pasa por el medio y mira a la cámara;
   * arcos, el cursor sobre el plano del arco (o, si se mira casi de canto, el que mira a la cámara).
   */
  private placementPoint(mx: number, my: number, w: number, h: number) {
    if (this.draft.length < this.needed) return null;
    this.raycaster.setFromCamera(new THREE.Vector2((mx / w) * 2 - 1, -(my / h) * 2 + 1), this.camera);
    let plane: THREE.Plane;
    const camDir = this.camera.getWorldDirection(new THREE.Vector3());
    if (this.kind !== "linear") {
      const circ = circle3d(this.draft[0], this.draft[1], this.draft[2]);
      if (!circ) return null;
      const n = v3(circ.normal);
      plane = Math.abs(n.dot(this.raycaster.ray.direction)) > 0.08
        ? new THREE.Plane().setFromNormalAndCoplanarPoint(n, v3(circ.center))
        : new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, v3(circ.center));
    } else {
      const mid = v3(this.draft[0]).add(v3(this.draft[1])).multiplyScalar(0.5);
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, mid);
    }
    const p = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return p ? arr(p) : null;
  }

  private showMarker(s: Snap | null) {
    this.marker.visible = !!s;
    if (!s) return;
    this.marker.position.set(...s.point);
    this.marker.element.dataset.kind = s.kind;
  }

  private updatePreview(mx: number, my: number, w: number, h: number) {
    const pts = this.draft;
    if (pts.length && pts.length < this.needed) {
      const s = this.snapAt(mx, my, w, h);
      this.showMarker(s);
      if (!s) return;
      // guía: los puntos elegidos y el del cursor
      const chain = [...pts, s.point].map(v3);
      const segs: THREE.Vector3[] = [];
      for (let i = 0; i + 1 < chain.length; i++) segs.push(chain[i], chain[i + 1]);
      this.preview.geometry.setFromPoints(segs);
      this.preview.visible = true;
      if (this.kind === "linear") {
        const g = dim3d(pts[0], s.point, s.point, this.axis);
        this.previewLabel.visible = !!g;
        if (g) {
          this.previewLabel.position.copy(chain[0].clone().add(chain[1]).multiplyScalar(0.5));
          this.previewLabel.element.textContent = formatLength(g.value, this.unit, this.decimals);
        }
      } else this.previewLabel.visible = false;
    } else if (pts.length >= this.needed) {
      this.showMarker(null);
      const off = this.placementPoint(mx, my, w, h);
      if (!off) return;
      const d = this.draftDimension(off);
      if (this.kind !== "linear") {
        const c = this.curvedSegments(d);
        if (!c) return;
        this.preview.geometry.setFromPoints(c.segs);
        this.previewLabel.position.copy(c.labelPos);
        this.previewLabel.element.textContent = c.text;
      } else {
        const r = this.dimSegments(d.a, d.b, off, this.axis);
        if (!r) return;
        this.preview.geometry.setFromPoints(r.segs);
        this.previewLabel.position.copy(r.mid);
        this.previewLabel.element.textContent = formatLength(r.value, this.unit, this.decimals);
      }
      this.preview.visible = true;
      this.previewLabel.visible = true;
    }
  }

  private onPointerMove = (ev: PointerEvent) => {
    const { x, y, w, h } = this.mouse(ev);
    if (this.measuring && this.exploded === 0) {
      if (!this.draft.length) this.showMarker(this.snapAt(x, y, w, h));
      else this.updatePreview(x, y, w, h);
      return;
    }
    if (ev.buttons) return;
    const ndc = new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes.filter((m) => m.visible), false)[0];
    const name = hit?.object.name ?? null;
    if (name !== this.hoverBody) {
      this.hoverBody = name;
      this.events.onHoverBody?.(name);
    }
  };

  private onPointerDown = (ev: PointerEvent) => {
    this.downAt = { x: ev.clientX, y: ev.clientY };
  };

  private onPointerUp = (ev: PointerEvent) => {
    // Un clic (sin arrastrar para girar la cámara)
    if (!this.downAt || Math.hypot(ev.clientX - this.downAt.x, ev.clientY - this.downAt.y) > 5 || ev.button !== 0) return;
    this.downAt = null;
    const { x, y, w, h } = this.mouse(ev);
    if (!this.measuring || this.exploded !== 0) {
      this.events.onSelectDimension?.(null);
      return;
    }
    if (this.draft.length < this.needed) {
      const s = this.snapAt(x, y, w, h);
      if (!s) return;
      const p = s.point;
      if (this.draft.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6)) return;
      // tres puntos alineados no definen un arco
      if (this.draft.length === 2 && this.kind !== "linear" && !circle3d(this.draft[0], this.draft[1], p)) return;
      this.draft = [...this.draft, p];
    } else {
      const off = this.placementPoint(x, y, w, h);
      if (!off) return;
      this.events.onCreateDimension?.(this.draftDimension(off));
      this.cancelDraft();
      return;
    }
    this.events.onDraftChange?.({ points: this.draft, needed: this.needed });
    this.updatePreview(x, y, w, h);
  };

  private onPointerLeave = () => {
    this.showMarker(null);
    if (this.hoverBody) {
      this.hoverBody = null;
      this.events.onHoverBody?.(null);
    }
  };

  // ── Bucle ─────────────────────────────────────────────────────────────

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame = () => {
    this.controls.update();
    // las flechas tienen tamaño de pantalla: se rehacen al mover la cámara
    for (const v of this.dims.values()) this.updateDimVisual(v);
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };

  /** Captura PNG del visor (para miniaturas o compartir). */
  snapshot() {
    return this.renderer.domElement.toDataURL("image/png");
  }
}
