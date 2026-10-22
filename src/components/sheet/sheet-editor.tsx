"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Maximize, MousePointer2, Plus, Printer, RefreshCw, Ruler, Trash2, Type } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { dimShape, SheetSvg } from "@/components/sheet/sheet-svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { projectView, VIEW_DIRS, viewSnapPoints } from "@/lib/drawing/project";
import { fitScale, MARGIN, paperToView, SCALES, sheetSize, TITLE_H, viewToPaper } from "@/lib/drawing/sheet-math";
import { fetchMesh, type Body } from "@/lib/geometry/mesh";
import type { SheetData, SheetDim, SheetDimOrient, SheetSize, SheetView, TitleBlock, Vec2, ViewKind } from "@/lib/types";
import { SHEET_SIZES } from "@/lib/types";

type Tool = "select" | "dim" | "text";
type OrientMode = "auto" | SheetDimOrient;
type Pick = { viewId: string; p: Vec2 };
type Drag = { kind: "view" | "text"; id: string; start: Vec2; orig: Vec2 } | { kind: "pan"; startClient: Vec2; vb: [number, number, number, number] };

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
  const [pickA, setPickA] = useState<Pick | null>(null);
  const [pickB, setPickB] = useState<Pick | null>(null);
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

  async function regenerate(view: SheetView) {
    try {
      const b = await ensureBodies();
      setBusy("Proyectando vista…");
      await new Promise((r) => setTimeout(r, 20));
      const proj = projectView(b, view.kind);
      update((d) => ({ ...d, views: d.views.map((v) => (v.id === view.id ? { ...v, ...proj } : v)) }));
    } finally {
      setBusy(null);
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
    if (!pickA || !pickB || !cursor) return null;
    const view = data.views.find((v) => v.id === pickA.viewId);
    if (!view) return null;
    const m = paperToView(view, cursor);
    const a = pickA.p, b = pickB.p;
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
  }, [pickA, pickB, cursor, data.views, orientMode]);

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
      if (!pickA) {
        const s = findSnap(paper);
        if (s) setPickA({ viewId: s.viewId, p: s.p });
      } else if (!pickB) {
        const s = findSnap(paper, pickA.viewId);
        if (s && Math.hypot(s.p[0] - pickA.p[0], s.p[1] - pickA.p[1]) > 1e-6) setPickB({ viewId: s.viewId, p: s.p });
      } else if (draftDim) {
        const dim = { ...draftDim, id: nanoid(8) };
        update((d) => ({ ...d, dims: [...d.dims, dim] }));
        setPickA(null);
        setPickB(null);
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
          : { ...d, texts: d.texts.map((t) => (t.id === dr.id ? { ...t, x: nx, y: ny } : t)) },
      );
      return;
    }
    if (tool === "dim") {
      setCursor(paper);
      setHoverSnap(pickB ? null : findSnap(paper, pickA?.viewId));
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
    }));
    setSelected(null);
  }, [selected, update]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input, textarea, [role=combobox]")) return;
      if (e.key === "Escape") {
        setPickA(null);
        setPickB(null);
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
  const pickView = pickA ? data.views.find((v) => v.id === pickA.viewId) : undefined;

  const setTitle = (k: keyof TitleBlock, v: string) => update((d) => ({ ...d, title: { ...d.title, [k]: v } }));
  const setView = (id: string, patch: Partial<SheetView>) => update((d) => ({ ...d, views: d.views.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));

  const step =
    tool === "dim" ? (!pickA ? "Clic en el primer punto de una vista" : !pickB ? "Clic en el segundo punto (misma vista)" : "Mueve para ubicar la cota y haz clic") : tool === "text" ? "Clic donde va el texto" : null;

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
        <div className="mx-2 h-6 w-px bg-border" />
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={tool}
          onValueChange={(v) => {
            if (!v) return;
            setTool(v as Tool);
            setPickA(null);
            setPickB(null);
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
            {pickA && pickView && (
              <circle cx={viewToPaper(pickView, pickA.p)[0]} cy={viewToPaper(pickView, pickA.p)[1]} r={1} fill="#e8590c" />
            )}
            {pickA && !pickB && hoverSnap && pickView && (
              <line
                x1={viewToPaper(pickView, pickA.p)[0]}
                y1={viewToPaper(pickView, pickA.p)[1]}
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
