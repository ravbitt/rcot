"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Maximize, MousePointer2, Plus, Printer, RefreshCw, Ruler, Table as TableIcon, Trash2, Type } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { dimShape, SheetSvg, tableSize } from "@/components/sheet/sheet-svg";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { placeMarks } from "@/lib/drawing/marks";
import { pieceAnchors, projectView, renderFill, VIEW_DIRS, viewSnapPoints } from "@/lib/drawing/project";
import { circle3 } from "@/lib/geometry/dim";
import { explodeBodies } from "@/lib/geometry/explode";
import { groupPieces, toRows, type PieceGroup } from "@/lib/geometry/pieces";
import { fitScale, MARGIN, paperToView, SCALES, sheetSize, TITLE_H, viewToPaper } from "@/lib/drawing/sheet-math";
import { fetchMesh, type Body } from "@/lib/geometry/mesh";
import type { SheetData, SheetDim, SheetDimKind, SheetDimOrient, SheetMark, SheetSize, SheetStyle, SheetTable, SheetView, TitleBlock, Vec2, ViewKind } from "@/lib/types";
import { DEFAULT_STYLE } from "@/lib/types";
import { SHEET_SIZES } from "@/lib/types";

type Tool = "select" | "dim" | "text";
type OrientMode = "auto" | SheetDimOrient;
type PickPoint = { viewId: string; p: Vec2 };
type Drag = { kind: "view" | "text" | "table" | "mark"; id: string; start: Vec2; orig: Vec2 } | { kind: "pan"; startClient: Vec2; vb: [number, number, number, number] };

const KIND_ORDER: ViewKind[] = ["iso", "front", "right", "left", "back", "top", "iso-back"];

export function SheetEditor(props: { sheetId: string; modelId: string; modelName: string; name: string; data: SheetData }) {
  const [data, setData] = useState<SheetData>(props.data);
  const [name, setName] = useState(props.name);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [orientMode, setOrientMode] = useState<OrientMode>("auto");
  const [save, setSave] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [bodies, setBodies] = useState<Body[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<ViewKind>("front");
  const [newScale, setNewScale] = useState<string>("auto");
  const [W, H] = sheetSize(data);
  const [vb, setVb] = useState<[number, number, number, number]>([0, 0, W, H]);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dimKind, setDimKind] = useState<SheetDimKind>("linear");
  // Puntos elegidos para la cota en preparación (2 para lineales, 3 para arcos, radios y ángulos)
  const [picks, setPicks] = useState<PickPoint[]>([]);
  const pickA = picks[0] ?? null;
  const needed = dimKind === "linear" ? 2 : 3;
  const [hoverSnap, setHoverSnap] = useState<{ viewId: string; p: Vec2; paper: Vec2 } | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const first = useRef(true);

  // ── Guardado automático ─────────────────────────────────────────────
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("dirty");
    const t = setTimeout(async () => {
      setSave("saving");
      const res = await fetch(`/api/sheets/${props.sheetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Plano", data }),
      }).catch(() => null);
      setSave(res?.ok ? "saved" : "error");
      if (!res?.ok) toast.error("No se pudo guardar el plano");
    }, 700);
    return () => clearTimeout(t);
  }, [data, name, props.sheetId]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const update = useCallback((fn: (d: SheetData) => SheetData) => setData((d) => fn(d)), []);
  // Grupos del despiece (todas las piezas del modelo): para elegir qué piezas dibuja cada vista
  const allGroups = useMemo(() => (bodies ? groupPieces(bodies).groups : null), [bodies]);

  // ── Malla (para proyectar vistas) ──────────────────────────────────
  const ensureBodies = useCallback(async () => {
    if (bodies) return bodies;
    setBusy("Cargando modelo…");
    try {
      const { bodies: b } = await fetchMesh(`/api/models/${props.modelId}/mesh`);
      setBodies(b);
      return b;
    } finally {
      setBusy(null);
    }
  }, [bodies, props.modelId]);

  async function addView() {
    try {
      const b = await ensureBodies();
      setBusy("Proyectando vista…");
      await new Promise((r) => setTimeout(r, 20));
      const proj = projectView(b, newKind);
      const [minU, minV, maxU, maxV] = proj.bounds;
      const scale = newScale === "auto" ? fitScale(maxU - minU, maxV - minV, (W - 2 * MARGIN) * 0.45, (H - 2 * MARGIN - TITLE_H) * 0.6) : Number(newScale);
      const view: SheetView = {
        id: nanoid(8),
        kind: newKind,
        scale,
        x: W / 2,
        y: (H - TITLE_H) / 2,
        showHidden: !newKind.startsWith("iso"),
        visible: proj.visible,
        hidden: proj.hidden,
        bounds: proj.bounds,
        label: VIEW_DIRS[newKind].label,
      };
      update((d) => ({ ...d, views: [...d.views, view] }));
      setSelected(view.id);
      setTool("select");
      toast.success(`${view.label} agregada a 1:${scale}. Arrástrala a su lugar.`);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo proyectar la vista");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Relleno por pieza de una vista, con los mismos colores que el despiece (~10 px por mm de papel).
   * Los grupos se calculan sobre las piezas armadas (la explosión no cambia sus medidas).
   */
  function fillFor(b: Body[], view: Pick<SheetView, "kind" | "bounds" | "scale" | "explode" | "bodies">) {
    const { groups, bodyGroup } = groupPieces(b);
    const sub = viewSubset(b, view);
    const colors = sub.idx.map((i) => groups[bodyGroup[i]].color);
    return renderFill(explodeBodies(sub.bodies, view.explode ?? 0), view.kind, view.bounds, colors, 10 / view.scale);
  }

  /** Vuelve a proyectar la vista (con su explosión) y, si tenía relleno de color, también lo rehace. */
  async function regenerate(view: SheetView, patch: Partial<SheetView> = {}) {
    try {
      const b = await ensureBodies();
      setBusy("Proyectando vista…");
      await new Promise((r) => setTimeout(r, 20));
      const next = { ...view, ...patch };
      const proj = projectView(explodeBodies(viewSubset(b, next).bodies, next.explode ?? 0), next.kind);
      const fill = next.fill ? fillFor(b, { ...next, bounds: proj.bounds }) : next.fill;
      // Si la vista tenía claves, se vuelven a ubicar sobre la vista nueva (mismo modo: por tipo o todas)
      const old = (data.marks ?? []).filter((m) => m.viewId === view.id);
      const marks = old.length
        ? computeMarks(b, { ...next, ...proj }, old.length > groupPieces(b).groups.length ? "all" : "type", { ...DEFAULT_STYLE, ...data.style })
        : [];
      update((d) => ({
        ...d,
        views: d.views.map((v) => (v.id === view.id ? { ...next, ...proj, fill } : v)),
        marks: old.length ? [...(d.marks ?? []).filter((m) => m.viewId !== view.id), ...marks] : d.marks,
      }));
    } finally {
      setBusy(null);
    }
  }

  async function toggleFill(view: SheetView, on: boolean) {
    if (!on) return setView(view.id, { fill: null });
    try {
      const b = await ensureBodies();
      setBusy("Coloreando piezas…");
      await new Promise((r) => setTimeout(r, 20));
      setView(view.id, { fill: fillFor(b, view) });
    } catch (err) {
      console.error(err);
      toast.error("No se pudo colorear la vista");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Claves de piezas de una vista: una por tipo (la pieza más cercana al borde de la vista) o en todas.
   * Los puntos se buscan sobre la parte visible de cada pieza (con la explosión de la vista).
   */
  function computeMarks(b: Body[], view: SheetView, mode: "type" | "all", style: SheetStyle): SheetMark[] {
    const { groups, bodyGroup } = groupPieces(b);
    // anclas solo de las piezas de la vista, devueltas en el índice de cada cuerpo
    const sub = viewSubset(b, view);
    const subAnchors = pieceAnchors(explodeBodies(sub.bodies, view.explode ?? 0), view.kind);
    const anchors: ([number, number] | null)[] = b.map(() => null);
    sub.idx.forEach((bi, k) => (anchors[bi] = subAnchors[k]));
    const [x0, y0, x1, y1] = view.bounds;
    const edgeDist = (p: Vec2) => Math.min(p[0] - x0, x1 - p[0], p[1] - y0, y1 - p[1]);
    let picked: number[];
    if (mode === "all") picked = anchors.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
    else {
      picked = groups
        .map((_, gi) => {
          const cands = bodyGroup.map((g, i) => (g === gi && anchors[i] ? i : -1)).filter((i) => i >= 0);
          return cands.sort((i, j) => edgeDist(anchors[i]!) - edgeDist(anchors[j]!))[0] ?? -1;
        })
        .filter((i) => i >= 0);
    }
    const seeds = picked.map((i) => ({ mark: groups[bodyGroup[i]].mark, color: groups[bodyGroup[i]].color, anchor: anchors[i]! }));
    const pos = placeMarks(seeds, view.bounds, style.markSize * 0.95 * view.scale, 12 * view.scale);
    return seeds.map((sd, k) => ({ id: nanoid(8), viewId: view.id, ...sd, pos: pos[k] }));
  }

  async function putMarks(view: SheetView, mode: "type" | "all") {
    try {
      const b = await ensureBodies();
      setBusy("Ubicando claves…");
      await new Promise((r) => setTimeout(r, 20));
      const marks = computeMarks(b, view, mode, { ...DEFAULT_STYLE, ...data.style });
      update((d) => ({ ...d, marks: [...(d.marks ?? []).filter((m) => m.viewId !== view.id), ...marks] }));
      toast.success(`${marks.length} claves. Arrastra los globos para acomodarlos.`);
    } catch (err) {
      console.error(err);
      toast.error("No se pudieron ubicar las claves");
    } finally {
      setBusy(null);
    }
  }

  /** Tabla de despiece: piezas iguales agrupadas con marca, color, cantidad y medidas. */
  async function addTable(existing?: SheetTable) {
    try {
      const b = await ensureBodies();
      const rows = toRows(groupPieces(b).groups);
      if (existing) {
        update((d) => ({ ...d, tables: (d.tables ?? []).map((t) => (t.id === existing.id ? { ...t, rows } : t)) }));
        return;
      }
      const t: SheetTable = { id: nanoid(8), x: MARGIN + 4, y: MARGIN + 4, title: "Despiece", showColors: true, multiplier: 1, rows };
      update((d) => ({ ...d, tables: [...(d.tables ?? []), t] }));
      setSelected(t.id);
      setTool("select");
      toast.success(`Despiece con ${rows.length} tipos de pieza. Arrástralo a su lugar.`);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo calcular el despiece");
    }
  }

  // ── Imán: puntos de cada vista sobre el papel ──────────────────────
  const snaps = useMemo(
    () => data.views.map((v) => ({ view: v, pts: viewSnapPoints(v.visible, v.showHidden ? v.hidden : []) })),
    [data.views],
  );

  const toPaper = useCallback((clientX: number, clientY: number): Vec2 | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  }, []);

  const mmPerPx = useCallback(() => {
    const w = svgRef.current?.clientWidth || 1;
    return vb[2] / w;
  }, [vb]);

  const findSnap = useCallback(
    (paper: Vec2, onlyView?: string) => {
      const tol = 10 * mmPerPx();
      let best: { viewId: string; p: Vec2; paper: Vec2 } | null = null;
      let bestD = tol;
      for (const { view, pts } of snaps) {
        if (onlyView && view.id !== onlyView) continue;
        for (const p of pts) {
          const q = viewToPaper(view, p);
          const d = Math.hypot(q[0] - paper[0], q[1] - paper[1]);
          if (d < bestD) {
            bestD = d;
            best = { viewId: view.id, p, paper: q };
          }
        }
      }
      return best;
    },
    [snaps, mmPerPx],
  );

  /** Cota en preparación según la posición del cursor (orientación automática como en CAD). */
  const draftDim = useMemo((): SheetDim | null => {
    if (picks.length < needed || !cursor) return null;
    const view = data.views.find((v) => v.id === picks[0].viewId);
    if (!view) return null;
    const m = paperToView(view, cursor);
    if (dimKind !== "linear") {
      const [p0, p1, p2] = picks.map((q) => q.p);
      // arcos, radios y diámetros: a = inicio, c = intermedio, b = final; ángulo: a = vértice, b y c = lados
      const pts = dimKind === "angle" ? { a: p0, b: p1, c: p2 } : { a: p0, c: p1, b: p2 };
      return { id: "draft", viewId: view.id, kind: dimKind, ...pts, p: m, orient: "aligned", offset: 0, text: null };
    }
    const a = picks[0].p, b = picks[1].p;
    let orient: SheetDimOrient = orientMode === "auto" ? "h" : orientMode;
    if (orientMode === "auto") {
      const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
      const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      const outX = m[0] < x0 ? x0 - m[0] : m[0] > x1 ? m[0] - x1 : 0;
      const outY = m[1] < y0 ? y0 - m[1] : m[1] > y1 ? m[1] - y1 : 0;
      if (Math.abs(a[0] - b[0]) < 1e-6) orient = "v";
      else if (Math.abs(a[1] - b[1]) < 1e-6) orient = "h";
      else orient = outX > outY ? "v" : "h";
    }
    let n: Vec2;
    if (orient === "h") n = [0, 1];
    else if (orient === "v") n = [-1, 0];
    else {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      n = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    }
    const offset = (m[0] - a[0]) * n[0] + (m[1] - a[1]) * n[1];
    return { id: "draft", viewId: view.id, a, b, orient, offset, text: null };
  }, [picks, needed, dimKind, cursor, data.views, orientMode]);

  // ── Eventos del lienzo ─────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const paper = toPaper(e.clientX, e.clientY);
    if (!paper) return;
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      drag.current = { kind: "pan", startClient: [e.clientX, e.clientY], vb };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    if (tool === "dim") {
      if (picks.length < needed) {
        const s = findSnap(paper, picks[0]?.viewId);
        if (!s || picks.some((q) => Math.hypot(s.p[0] - q.p[0], s.p[1] - q.p[1]) < 1e-6)) return;
        if (!picks.length && dimKind !== "linear" && data.views.find((v) => v.id === s.viewId)?.kind.startsWith("iso")) {
          toast.info("En una isométrica los arcos se ven como elipses: mide radios y arcos en una vista donde se vean de frente.");
        }
        setPicks([...picks, { viewId: s.viewId, p: s.p }]);
      } else if (draftDim) {
        if (dimKind !== "linear" && (dimKind === "angle" ? false : !circle3(draftDim.a, draftDim.c!, draftDim.b))) {
          toast.error("Los tres puntos están alineados: elige puntos sobre el arco.");
          setPicks([]);
          return;
        }
        const dim = { ...draftDim, id: nanoid(8) };
        update((d) => ({ ...d, dims: [...d.dims, dim] }));
        setPicks([]);
      }
      return;
    }
    if (tool === "text") {
      const t = { id: nanoid(8), x: paper[0], y: paper[1], text: "Texto", size: 4 };
      update((d) => ({ ...d, texts: [...d.texts, t] }));
      setSelected(t.id);
      setTool("select");
      return;
    }
    setSelected(null);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const dr = drag.current;
    if (dr?.kind === "pan") {
      const k = vb[2] / (svgRef.current?.clientWidth || 1);
      setVb([dr.vb[0] - (e.clientX - dr.startClient[0]) * k, dr.vb[1] - (e.clientY - dr.startClient[1]) * k, dr.vb[2], dr.vb[3]]);
      return;
    }
    const paper = toPaper(e.clientX, e.clientY);
    if (!paper) return;
    if (dr) {
      const nx = Math.round(dr.orig[0] + paper[0] - dr.start[0]);
      const ny = Math.round(dr.orig[1] + paper[1] - dr.start[1]);
      update((d) =>
        dr.kind === "view"
          ? { ...d, views: d.views.map((v) => (v.id === dr.id ? { ...v, x: nx, y: ny } : v)) }
          : dr.kind === "table"
            ? { ...d, tables: (d.tables ?? []).map((t) => (t.id === dr.id ? { ...t, x: nx, y: ny } : t)) }
            : dr.kind === "mark"
              ? {
                  ...d,
                  marks: (d.marks ?? []).map((m) => {
                    const v = m.id === dr.id && d.views.find((x) => x.id === m.viewId);
                    return v ? { ...m, pos: paperToView(v, [dr.orig[0] + paper[0] - dr.start[0], dr.orig[1] + paper[1] - dr.start[1]]) } : m;
                  }),
                }
            : { ...d, texts: d.texts.map((t) => (t.id === dr.id ? { ...t, x: nx, y: ny } : t)) },
      );
      return;
    }
    if (tool === "dim") {
      setCursor(paper);
      setHoverSnap(picks.length >= needed ? null : findSnap(paper, picks[0]?.viewId));
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    const paper = toPaper(e.clientX, e.clientY);
    if (!paper) return;
    const k = Math.exp(e.deltaY * 0.0015);
    const w = Math.min(Math.max(vb[2] * k, 20), W * 3);
    const f = w / vb[2];
    setVb([paper[0] - (paper[0] - vb[0]) * f, paper[1] - (paper[1] - vb[1]) * f, w, vb[3] * f]);
  }

  // El navegador no permite preventDefault en onWheel de React (pasivo): se bloquea el scroll aquí
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const block = (e: WheelEvent) => e.preventDefault();
    svg.addEventListener("wheel", block, { passive: false });
    return () => svg.removeEventListener("wheel", block);
  }, []);

  const fit = useCallback(() => setVb([0, 0, W, H]), [W, H]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    update((d) => ({
      ...d,
      views: d.views.filter((v) => v.id !== selected),
      dims: d.dims.filter((x) => x.id !== selected && x.viewId !== selected),
      texts: d.texts.filter((t) => t.id !== selected),
      tables: (d.tables ?? []).filter((t) => t.id !== selected),
      marks: (d.marks ?? []).filter((m) => m.id !== selected && m.viewId !== selected),
    }));
    setSelected(null);
  }, [selected, update]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input, textarea, [role=combobox]")) return;
      if (e.key === "Escape") {
        setPicks([]);
        setTool("select");
      } else if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
      else if (e.key.toLowerCase() === "d") setTool("dim");
      else if (e.key.toLowerCase() === "v") setTool("select");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected]);

  const selView = data.views.find((v) => v.id === selected);
  const selDim = data.dims.find((d) => d.id === selected);
  const selText = data.texts.find((t) => t.id === selected);
  const selTable = (data.tables ?? []).find((t) => t.id === selected);
  const selMark = (data.marks ?? []).find((m) => m.id === selected);
  const style = { ...DEFAULT_STYLE, ...data.style };
  const setStyle = (k: keyof SheetStyle, v: number) => update((d) => ({ ...d, style: { ...DEFAULT_STYLE, ...d.style, [k]: v } }));
  const setTable = (id: string, patch: Partial<SheetTable>) =>
    update((d) => ({ ...d, tables: (d.tables ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const pickView = pickA ? data.views.find((v) => v.id === pickA.viewId) : undefined;

  const setTitle = (k: keyof TitleBlock, v: string) => update((d) => ({ ...d, title: { ...d.title, [k]: v } }));
  const setView = (id: string, patch: Partial<SheetView>) => update((d) => ({ ...d, views: d.views.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));

  const step =
    tool === "dim" ? dimStep(dimKind, picks.length) : tool === "text" ? "Clic donde va el texto" : null;

  return (
    <div className="flex h-[calc(100svh-3.5rem)] min-h-0 flex-col">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon-sm" asChild title="Volver al modelo">
          <Link href={`/admin/modelos/${props.modelId}`}>
            <ArrowLeft />
          </Link>
        </Button>
        <input
          className="w-48 rounded bg-transparent px-1 font-semibold outline-none hover:bg-muted focus:bg-muted"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre del plano"
        />
        <span className="text-xs text-muted-foreground">
          {save === "saved" ? "Guardado" : save === "saving" ? "Guardando…" : save === "error" ? "Error al guardar" : "Cambios sin guardar"}
        </span>
        <div className="mx-2 h-6 w-px bg-border" />
        <Select value={newKind} onValueChange={(v) => setNewKind(v as ViewKind)}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_ORDER.map((k) => (
              <SelectItem key={k} value={k}>
                {VIEW_DIRS[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={newScale} onValueChange={setNewScale}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Escala auto</SelectItem>
            {SCALES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                1:{s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={addView} disabled={!!busy}>
          <Plus /> Vista
        </Button>
        <Button size="sm" variant="outline" onClick={() => addTable()} disabled={!!busy} title="Tabla con las piezas, sus medidas y colores">
          <TableIcon /> Despiece
        </Button>
        <div className="mx-2 h-6 w-px bg-border" />
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={tool}
          onValueChange={(v) => {
            if (!v) return;
            setTool(v as Tool);
            setPicks([]);
          }}
        >
          <ToggleGroupItem value="select" title="Seleccionar y mover (V)">
            <MousePointer2 />
          </ToggleGroupItem>
          <ToggleGroupItem value="dim" title="Cota (D)">
            <Ruler />
          </ToggleGroupItem>
          <ToggleGroupItem value="text" title="Texto">
            <Type />
          </ToggleGroupItem>
        </ToggleGroup>
        {tool === "dim" && (
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={dimKind}
            onValueChange={(v) => {
              if (!v) return;
              setDimKind(v as SheetDimKind);
              setPicks([]);
            }}
          >
            <ToggleGroupItem value="linear" title="Distancia entre dos puntos">
              Lineal
            </ToggleGroupItem>
            <ToggleGroupItem value="radius" title="Radio: 3 puntos del arco">
              R
            </ToggleGroupItem>
            <ToggleGroupItem value="diameter" title="Diámetro: 3 puntos del arco">
              Ø
            </ToggleGroupItem>
            <ToggleGroupItem value="arc" title="Longitud de arco: inicio, punto intermedio y final">
              Arco
            </ToggleGroupItem>
            <ToggleGroupItem value="angle" title="Ángulo: vértice y un punto de cada lado">
              Ángulo
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        {tool === "dim" && dimKind === "linear" && (
          <ToggleGroup type="single" size="sm" variant="outline" value={orientMode} onValueChange={(v) => v && setOrientMode(v as OrientMode)}>
            <ToggleGroupItem value="auto">Auto</ToggleGroupItem>
            <ToggleGroupItem value="h">Horiz.</ToggleGroupItem>
            <ToggleGroupItem value="v">Vert.</ToggleGroupItem>
            <ToggleGroupItem value="aligned">Alineada</ToggleGroupItem>
          </ToggleGroup>
        )}
        <div className="ml-auto flex items-center gap-2">
          {busy && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> {busy}
            </span>
          )}
          <Button size="icon-sm" variant="ghost" onClick={fit} title="Ver hoja completa">
            <Maximize />
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/admin/modelos/${props.modelId}/planos/${props.sheetId}/imprimir`} target="_blank" rel="noreferrer">
              <Printer /> Imprimir / PDF
            </a>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Lienzo */}
        <div className="relative min-w-0 flex-1 bg-neutral-200">
          <SheetSvg
            data={data}
            svgRef={svgRef}
            viewBox={vb}
            selected={selected}
            className="absolute inset-0 h-full w-full select-none"
            onViewPointerDown={
              tool === "select"
                ? (e, view) => {
                    e.stopPropagation();
                    const p = toPaper(e.clientX, e.clientY);
                    if (!p) return;
                    setSelected(view.id);
                    drag.current = { kind: "view", id: view.id, start: p, orig: [view.x, view.y] };
                  }
                : undefined
            }
            onDimPointerDown={
              tool === "select"
                ? (e, dim) => {
                    e.stopPropagation();
                    setSelected(dim.id);
                  }
                : undefined
            }
            onMarkPointerDown={
              tool === "select"
                ? (e, m) => {
                    e.stopPropagation();
                    const p = toPaper(e.clientX, e.clientY);
                    const v = data.views.find((x) => x.id === m.viewId);
                    if (!p || !v) return;
                    setSelected(m.id);
                    drag.current = { kind: "mark", id: m.id, start: p, orig: viewToPaper(v, m.pos) };
                  }
                : undefined
            }
            onTablePointerDown={
              tool === "select"
                ? (e, t) => {
                    e.stopPropagation();
                    const p = toPaper(e.clientX, e.clientY);
                    if (!p) return;
                    setSelected(t.id);
                    drag.current = { kind: "table", id: t.id, start: p, orig: [t.x, t.y] };
                  }
                : undefined
            }
            onTextPointerDown={
              tool === "select"
                ? (e, id) => {
                    e.stopPropagation();
                    const p = toPaper(e.clientX, e.clientY);
                    const t = data.texts.find((x) => x.id === id);
                    if (!p || !t) return;
                    setSelected(id);
                    drag.current = { kind: "text", id, start: p, orig: [t.x, t.y] };
                  }
                : undefined
            }
            svgProps={{
              onPointerDown,
              onPointerMove,
              onPointerUp,
              onPointerLeave: onPointerUp,
              onWheel,
              style: { cursor: tool === "dim" || tool === "text" ? "crosshair" : undefined, touchAction: "none" },
            }}
          >
            {/* Capa de edición: imán y cota en preparación */}
            {hoverSnap && <rect x={hoverSnap.paper[0] - 1.2} y={hoverSnap.paper[1] - 1.2} width={2.4} height={2.4} fill="none" stroke="#e8590c" strokeWidth={0.35} />}
            {pickView &&
              picks.map((q, i) => <circle key={i} cx={viewToPaper(pickView, q.p)[0]} cy={viewToPaper(pickView, q.p)[1]} r={1} fill="#e8590c" />)}
            {pickA && picks.length < needed && hoverSnap && pickView && (
              <line
                x1={viewToPaper(pickView, picks[picks.length - 1].p)[0]}
                y1={viewToPaper(pickView, picks[picks.length - 1].p)[1]}
                x2={hoverSnap.paper[0]}
                y2={hoverSnap.paper[1]}
                stroke="#e8590c"
                strokeWidth={0.25}
                strokeDasharray="1 1"
              />
            )}
            {draftDim && pickView && <DraftDim view={pickView} dim={draftDim} data={data} />}
          </SheetSvg>
          {step && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <div className="rounded-full bg-black/75 px-3 py-1.5 text-xs text-white">
                {step} · <kbd>Esc</kbd> cancela · rueda: zoom · Alt+arrastrar: mover hoja
              </div>
            </div>
          )}
        </div>

        {/* Panel */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l bg-background p-3 text-sm">
          {selView && (
            <section className="mb-4 grid gap-2 rounded-lg border p-3">
              <h3 className="font-semibold">Vista seleccionada</h3>
              <Label>Título</Label>
              <Input value={selView.label} onChange={(e) => setView(selView.id, { label: e.target.value })} />
              <Label>Escala</Label>
              <Select value={String(selView.scale)} onValueChange={(v) => setView(selView.id, { scale: Number(v) })}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCALES.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      1:{s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center justify-between">
                Líneas ocultas
                <Switch checked={selView.showHidden} onCheckedChange={(c) => setView(selView.id, { showHidden: c })} />
              </label>
              <label className="flex items-center justify-between">
                Color por pieza
                <Switch checked={!!selView.fill} disabled={!!busy} onCheckedChange={(c) => toggleFill(selView, c)} />
              </label>
              <PiecesControl
                key={`pz-${selView.id}`}
                view={selView}
                groups={allGroups}
                disabled={!!busy}
                onOpen={() => void ensureBodies()}
                onApply={(sel, marks) => {
                  const base = VIEW_DIRS[selView.kind].label + ((selView.explode ?? 0) > 0 ? " explosionada" : "");
                  const isDefault = selView.label === base || selView.label.startsWith(`${base} – `);
                  const label = isDefault ? (sel ? `${base} – ${marks}` : base) : selView.label;
                  regenerate(selView, { bodies: sel, label });
                  if (data.dims.some((d) => d.viewId === selView.id)) toast.info("Las cotas de esta vista se dibujaron con las piezas anteriores: revísalas.");
                }}
              />
              <div className="grid gap-1 rounded-md bg-muted/50 p-2">
                <div className="flex items-center justify-between">
                  <span>Claves de piezas</span>
                  <span className="text-xs text-muted-foreground">{(data.marks ?? []).filter((m) => m.viewId === selView.id).length}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="xs" variant="outline" disabled={!!busy} onClick={() => putMarks(selView, "type")}>
                    Una por tipo
                  </Button>
                  <Button size="xs" variant="outline" disabled={!!busy} onClick={() => putMarks(selView, "all")}>
                    Todas
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={!(data.marks ?? []).some((m) => m.viewId === selView.id)}
                    onClick={() => update((d) => ({ ...d, marks: (d.marks ?? []).filter((m) => m.viewId !== selView.id) }))}
                  >
                    Quitar
                  </Button>
                </div>
                <label className="flex items-center justify-between text-xs">
                  Globos con color
                  <Switch checked={selView.marksColored !== false} onCheckedChange={(c) => setView(selView.id, { marksColored: c })} />
                </label>
              </div>
              <ExplodeControl
                key={selView.id}
                value={selView.explode ?? 0}
                disabled={!!busy}
                onCommit={(v) => {
                  const base = VIEW_DIRS[selView.kind].label;
                  const label = v > 0 && selView.label === base ? `${base} explosionada` : v === 0 && selView.label === `${base} explosionada` ? base : selView.label;
                  regenerate(selView, { explode: v, label });
                  if (v > 0 && data.dims.some((d) => d.viewId === selView.id)) toast.info("Las cotas de esta vista se dibujaron sobre la vista armada: revísalas.");
                }}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => regenerate(selView)} disabled={!!busy}>
                  <RefreshCw /> Regenerar
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={deleteSelected}>
                  <Trash2 /> Quitar
                </Button>
              </div>
            </section>
          )}
          {selDim && (
            <section className="mb-4 grid gap-2 rounded-lg border p-3">
              <h3 className="font-semibold">Cota seleccionada</h3>
              <Label>Texto (vacío = valor medido)</Label>
              <Input
                value={selDim.text ?? ""}
                onChange={(e) => update((d) => ({ ...d, dims: d.dims.map((x) => (x.id === selDim.id ? { ...x, text: e.target.value || null } : x)) }))}
              />
              <Button size="sm" variant="ghost" className="justify-start text-destructive" onClick={deleteSelected}>
                <Trash2 /> Borrar cota
              </Button>
            </section>
          )}
          {selMark && (
            <section className="mb-4 grid gap-2 rounded-lg border p-3">
              <h3 className="font-semibold">Clave {selMark.mark}</h3>
              <p className="text-xs text-muted-foreground">Arrastra el globo para moverlo; la línea sigue apuntando a la pieza.</p>
              <Button size="sm" variant="ghost" className="justify-start text-destructive" onClick={deleteSelected}>
                <Trash2 /> Quitar clave
              </Button>
            </section>
          )}
          {selTable && (
            <section className="mb-4 grid gap-2 rounded-lg border p-3">
              <h3 className="font-semibold">Despiece</h3>
              <Label>Título</Label>
              <Input value={selTable.title} onChange={(e) => setTable(selTable.id, { title: e.target.value })} />
              <label className="flex items-center justify-between">
                Colores de las piezas
                <Switch checked={selTable.showColors} onCheckedChange={(c) => setTable(selTable.id, { showColors: c })} />
              </label>
              <div className="grid gap-1">
                <div className="flex items-center justify-between">
                  <Label>Tamaño</Label>
                  <span className="font-mono text-xs text-muted-foreground">×{(selTable.scale ?? 1).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.05}
                  value={selTable.scale ?? 1}
                  onChange={(e) => setTable(selTable.id, { scale: Number(e.target.value) })}
                  onDoubleClick={() => setTable(selTable.id, { scale: 1 })}
                  className="accent-primary"
                  aria-label="Tamaño de la tabla"
                />
              </div>
              <Label>Módulos a fabricar (columna «Total»)</Label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={selTable.multiplier}
                onChange={(e) => setTable(selTable.id, { multiplier: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
              />
              <p className="text-xs text-muted-foreground">
                {tableSize(selTable).map((v) => Math.round(v)).join(" × ")} mm · {selTable.rows.length} tipos ·{" "}
                {selTable.rows.reduce((a, r) => a + r.qty, 0)} piezas por módulo
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => addTable(selTable)} disabled={!!busy}>
                  <RefreshCw /> Recalcular
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={deleteSelected}>
                  <Trash2 /> Quitar
                </Button>
              </div>
            </section>
          )}
          {selText && (
            <section className="mb-4 grid gap-2 rounded-lg border p-3">
              <h3 className="font-semibold">Texto</h3>
              <Textarea
                value={selText.text}
                onChange={(e) => update((d) => ({ ...d, texts: d.texts.map((t) => (t.id === selText.id ? { ...t, text: e.target.value } : t)) }))}
              />
              <Label>Tamaño (mm)</Label>
              <Input
                type="number"
                min={1.5}
                max={30}
                step={0.5}
                value={selText.size}
                onChange={(e) => update((d) => ({ ...d, texts: d.texts.map((t) => (t.id === selText.id ? { ...t, size: Number(e.target.value) || 4 } : t)) }))}
              />
              <Button size="sm" variant="ghost" className="justify-start text-destructive" onClick={deleteSelected}>
                <Trash2 /> Borrar texto
              </Button>
            </section>
          )}

          <section className="mb-4 grid gap-2">
            <h3 className="font-semibold">Hoja</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>Tamaño</Label>
                <Select value={data.size} onValueChange={(v) => {
                    update((d) => ({ ...d, size: v as SheetSize }));
                    const [nw, nh] = SHEET_SIZES[v as SheetSize];
                    setVb([0, 0, nw, nh]);
                  }}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SHEET_SIZES) as SheetSize[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s} horizontal
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Cotas en</Label>
                <Select
                  value={data.unit}
                  onValueChange={(v) => update((d) => ({ ...d, unit: v as "mm" | "cm", decimals: v === "cm" ? 1 : 0 }))}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cm">cm</SelectItem>
                    <SelectItem value="mm">mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label>Decimales</Label>
                <Input
                  type="number"
                  min={0}
                  max={3}
                  value={data.decimals}
                  onChange={(e) => update((d) => ({ ...d, decimals: Math.max(0, Math.min(3, Number(e.target.value) || 0)) }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>Color cotas</Label>
                <Input type="color" value={data.dimColor} onChange={(e) => update((d) => ({ ...d, dimColor: e.target.value }))} className="h-9 p-1" />
              </div>
            </div>
            <h4 className="mt-2 text-xs font-semibold text-muted-foreground uppercase">Estilo (mm de papel)</h4>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["dimText", "Número de cota", 0.5, 20, 0.25],
                  ["dimLine", "Línea de cota", 0.05, 2, 0.05],
                  ["dimArrow", "Flecha", 0.5, 15, 0.25],
                  ["lineVisible", "Línea visible", 0.05, 2, 0.05],
                  ["lineHidden", "Línea oculta", 0.05, 2, 0.05],
                  ["markSize", "Clave (letra)", 1, 20, 0.25],
                ] as [keyof SheetStyle, string, number, number, number][]
              ).map(([k, l, min, max, step]) => (
                <div key={k} className="grid gap-1">
                  <Label>{l}</Label>
                  <Input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={style[k]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) setStyle(k, Math.min(max, Math.max(min, v)));
                    }}
                  />
                </div>
              ))}
              <Button size="sm" variant="ghost" className="self-end" onClick={() => update((d) => ({ ...d, style: { ...DEFAULT_STYLE } }))}>
                Restablecer
              </Button>
            </div>
          </section>

          <section className="grid gap-2">
            <h3 className="font-semibold">Rótulo</h3>
            {(
              [
                ["proyecto", "Proyecto"],
                ["cliente", "Cliente"],
                ["plano", "Plano"],
                ["cantidad", "Cantidad"],
                ["dibujo", "Dibujó"],
                ["fecha", "Fecha"],
              ] as [keyof TitleBlock, string][]
            ).map(([k, l]) => (
              <div key={k} className="grid gap-1">
                <Label>{l}</Label>
                <Input value={data.title[k]} onChange={(e) => setTitle(k, e.target.value)} />
              </div>
            ))}
            <div className="grid gap-1">
              <Label>Notas</Label>
              <Textarea value={data.title.notas} onChange={(e) => setTitle("notas", e.target.value)} rows={2} />
            </div>
          </section>

          {data.views.length === 0 && (
            <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              Elige una vista arriba (frontal, lateral, isométrica…) y pulsa <b>Vista</b>. Después usa la herramienta de cota (D) sobre sus vértices.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Indicación para cada paso de la herramienta de cota. */
function dimStep(kind: SheetDimKind, n: number) {
  const steps: Record<SheetDimKind, string[]> = {
    linear: ["Clic en el primer punto de una vista", "Clic en el segundo punto (misma vista)"],
    radius: ["Clic en un punto del arco", "Clic en otro punto del arco", "Clic en un tercer punto del arco"],
    diameter: ["Clic en un punto del arco", "Clic en otro punto del arco", "Clic en un tercer punto del arco"],
    arc: ["Clic en el inicio del arco", "Clic en un punto intermedio del arco", "Clic en el final del arco"],
    angle: ["Clic en el vértice del ángulo", "Clic en un punto del primer lado", "Clic en un punto del segundo lado"],
  };
  return steps[kind][n] ?? (kind === "linear" ? "Mueve para ubicar la cota y haz clic" : "Mueve para ubicar el texto o la cota y haz clic");
}

/** Explosión de una vista: se aplica al soltar el deslizador (proyectar toma un momento). */
function ExplodeControl({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  const commit = () => v !== value && onCommit(v);
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <span>Explosionada</span>
        <span className="font-mono text-xs text-muted-foreground">{v === 0 ? "no" : `×${v.toFixed(2)}`}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1.5}
        step={0.05}
        value={v}
        disabled={disabled}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        className="accent-primary"
        aria-label="Factor de explosión"
      />
    </div>
  );
}

/**
 * Piezas que dibuja una vista: se eligen por tipo del despiece; «una sola de cada tipo» toma una pieza
 * por tipo (para dibujar en detalle una pieza curva, por ejemplo).
 */
function PiecesControl({
  view,
  groups,
  disabled,
  onOpen,
  onApply,
}: {
  view: SheetView;
  groups: PieceGroup[] | null;
  disabled: boolean;
  onOpen: () => void;
  onApply: (bodies: number[] | null, marks: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [oneEach, setOneEach] = useState(false);
  const current = view.bodies?.length ? view.bodies : null;
  const currentMarks = current && groups ? groups.filter((g) => g.bodies.some((i) => current.includes(i))).map((g) => g.mark) : [];

  function start() {
    onOpen();
    setOpen(true);
  }
  // Al tener los grupos, la selección parte de lo que dibuja la vista
  useEffect(() => {
    if (!open || !groups) return;
    const inView = current ? groups.filter((g) => g.bodies.some((i) => current.includes(i))) : groups;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selección inicial del diálogo
    setSel(new Set(inView.map((g) => g.mark)));
    setOneEach(!!current && inView.every((g) => g.bodies.filter((i) => current.includes(i)).length === 1) && inView.some((g) => g.qty > 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groups]);

  function apply() {
    if (!groups) return;
    const chosen = groups.filter((g) => sel.has(g.mark));
    if (!chosen.length) return toast.error("Elige al menos un tipo de pieza");
    const all = chosen.length === groups.length && !oneEach;
    const idx = chosen.flatMap((g) => (oneEach ? [g.bodies[0]] : g.bodies));
    onApply(all ? null : idx, chosen.map((g) => g.mark).join(", "));
    setOpen(false);
  }

  return (
    <div className="grid gap-1 rounded-md bg-muted/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span>Piezas de la vista</span>
        <span className="truncate text-xs text-muted-foreground">{current ? `${current.length} · ${currentMarks.join(", ") || "…"}` : "todas"}</span>
      </div>
      <div className="flex gap-1">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="xs" variant="outline" disabled={disabled} onClick={start}>
              Elegir piezas…
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Piezas de la vista</DialogTitle>
              <DialogDescription>La vista se vuelve a dibujar solo con estas piezas (con su color, explosión y claves).</DialogDescription>
            </DialogHeader>
            {!groups ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Cargando piezas…
              </p>
            ) : (
              <>
                <div className="flex gap-2 text-xs">
                  <Button size="xs" variant="outline" onClick={() => setSel(new Set(groups.map((g) => g.mark)))}>
                    Todas
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => setSel(new Set())}>
                    Ninguna
                  </Button>
                </div>
                <ul className="divide-y rounded-md border text-sm">
                  {groups.map((g) => (
                    <li key={g.mark}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={sel.has(g.mark)}
                          onChange={(e) =>
                            setSel((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(g.mark);
                              else n.delete(g.mark);
                              return n;
                            })
                          }
                        />
                        <span className="inline-block size-3 rounded-sm border border-black/30" style={{ background: g.color }} />
                        <b className="w-6 font-mono">{g.mark}</b>
                        <span className="min-w-0 flex-1 truncate">{g.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          ×{g.qty} · {g.dims.map((d) => Math.round(d)).join("×")}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <label className="flex items-center justify-between text-sm">
                  Una sola de cada tipo (para piezas de detalle)
                  <Switch checked={oneEach} onCheckedChange={setOneEach} />
                </label>
              </>
            )}
            <DialogFooter>
              <Button onClick={apply} disabled={!groups}>
                Aplicar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {current && (
          <Button size="xs" variant="ghost" disabled={disabled} onClick={() => onApply(null, "")}>
            Volver a todas
          </Button>
        )}
      </div>
    </div>
  );
}

/** Piezas que dibuja una vista: las elegidas (índices de cuerpo) o todas. */
function viewSubset(b: Body[], view: Pick<SheetView, "bodies">) {
  const idx = view.bodies?.length ? view.bodies.filter((i) => i >= 0 && i < b.length) : b.map((_, i) => i);
  return { idx, bodies: idx.map((i) => b[i]) };
}

function DraftDim({ view, dim, data }: { view: SheetView; dim: SheetDim; data: SheetData }) {
  const s = dimShape(view, dim, data);
  if (!s) return null;
  return (
    <g opacity={0.75} pointerEvents="none">
      <path d={s.lines} fill="none" stroke="#e8590c" strokeWidth={0.18} />
      <path d={s.arrows} fill="#e8590c" />
      <text x={s.text.x} y={s.text.y} fontSize={3} fontWeight={700} fill="#e8590c" textAnchor="middle" transform={`rotate(${s.text.angle} ${s.text.x} ${s.text.y})`}>
        {s.text.value}
      </text>
    </g>
  );
}
