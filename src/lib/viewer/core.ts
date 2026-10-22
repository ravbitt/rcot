// Visor 3D (three.js): modelo, aristas, imán a vértices/aristas y cotas.
// Sin React: el componente <ModelViewer> lo crea y le pasa los cambios.

import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { dim3d, formatLength } from "@/lib/geometry/dim";
import { bodyEdges, type Body, type Edge } from "@/lib/geometry/mesh";
import type { Dimension, DimensionAxis, Vec3 } from "@/lib/types";

export type SnapKind = "vertex" | "midpoint" | "edge" | "face";
export type Snap = { point: Vec3; kind: SnapKind; body: string };

export type MeasureDraft = { a: Vec3 | null; b: Vec3 | null };

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
  private draft: MeasureDraft = { a: null, b: null };
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

  setHiddenBodies(hidden: Set<string>) {
    for (const o of this.model.children) {
      const name = (o.userData.body as string | undefined) ?? o.name;
      o.visible = !hidden.has(name);
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

  setDimensionsVisible(visible: boolean) {
    this.dimsGroup.visible = visible;
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

  private updateDimVisual(v: DimVisual) {
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

  setMeasuring(on: boolean, axis: DimensionAxis) {
    this.measuring = on;
    this.axis = axis;
    if (!on) this.cancelDraft();
    this.renderer.domElement.style.cursor = on ? "crosshair" : "";
  }

  setAxis(axis: DimensionAxis) {
    this.axis = axis;
  }

  cancelDraft() {
    this.draft = { a: null, b: null };
    this.preview.visible = false;
    this.previewLabel.visible = false;
    this.events.onDraftChange?.(this.draft);
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

  /** Punto de colocación de la línea de cota: el cursor sobre el plano que pasa por el medio y mira a la cámara. */
  private placementPoint(mx: number, my: number, w: number, h: number) {
    const { a, b } = this.draft;
    if (!a || !b) return null;
    const mid = v3(a).add(v3(b)).multiplyScalar(0.5);
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, mid);
    this.raycaster.setFromCamera(new THREE.Vector2((mx / w) * 2 - 1, -(my / h) * 2 + 1), this.camera);
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
    const { a, b } = this.draft;
    if (a && !b) {
      const s = this.snapAt(mx, my, w, h);
      this.showMarker(s);
      if (!s) return;
      const pa = v3(a);
      const pb = v3(s.point);
      this.preview.geometry.setFromPoints([pa, pb]);
      this.preview.visible = true;
      const g = dim3d(a, s.point, s.point, this.axis);
      this.previewLabel.visible = !!g;
      if (g) {
        this.previewLabel.position.copy(pa.add(pb).multiplyScalar(0.5));
        this.previewLabel.element.textContent = formatLength(g.value, this.unit, this.decimals);
      }
    } else if (a && b) {
      this.showMarker(null);
      const off = this.placementPoint(mx, my, w, h);
      if (!off) return;
      const r = this.dimSegments(a, b, off, this.axis);
      if (!r) return;
      this.preview.geometry.setFromPoints(r.segs);
      this.preview.visible = true;
      this.previewLabel.visible = true;
      this.previewLabel.position.copy(r.mid);
      this.previewLabel.element.textContent = formatLength(r.value, this.unit, this.decimals);
    }
  }

  private onPointerMove = (ev: PointerEvent) => {
    const { x, y, w, h } = this.mouse(ev);
    if (this.measuring) {
      if (!this.draft.a) this.showMarker(this.snapAt(x, y, w, h));
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
    if (!this.measuring) {
      this.events.onSelectDimension?.(null);
      return;
    }
    if (!this.draft.a) {
      const s = this.snapAt(x, y, w, h);
      if (!s) return;
      this.draft = { a: s.point, b: null };
    } else if (!this.draft.b) {
      const s = this.snapAt(x, y, w, h);
      if (!s) return;
      if (Math.hypot(s.point[0] - this.draft.a[0], s.point[1] - this.draft.a[1], s.point[2] - this.draft.a[2]) < 1e-6) return;
      this.draft = { a: this.draft.a, b: s.point };
    } else {
      const off = this.placementPoint(x, y, w, h);
      if (!off) return;
      const { a, b } = this.draft;
      this.events.onCreateDimension?.({ a, b, offset: off, axis: this.axis, label: null });
      this.cancelDraft();
      return;
    }
    this.events.onDraftChange?.(this.draft);
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
