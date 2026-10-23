"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronRight, Download, Eye, EyeOff, FileText, Folder, Link2, Maximize, Palette, Plus, Ruler, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SheetSvg } from "@/components/sheet/sheet-svg";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SharesPanel, type ShareRow } from "@/components/admin/shares-panel";
import { ModelViewer } from "@/components/viewer/model-viewer";
import { ExplodeSlider } from "@/components/viewer/explode-slider";
import { PiecesList } from "@/components/viewer/pieces-list";
import { groupPieces, type PieceGroup } from "@/lib/geometry/pieces";
import { useUnit } from "@/hooks/use-unit";
import { deleteModel, moveModel, renameModel } from "@/lib/actions";
import { dim3d, formatLength } from "@/lib/geometry/dim";
import type { MeasureDraft, ViewerCore } from "@/lib/viewer/core";
import type { Dimension, DimensionAxis, SheetData, Vec3 } from "@/lib/types";
import { cn } from "@/lib/utils";

type ModelInfo = { id: string; name: string; bodyCount: number; bbox: [Vec3, Vec3]; originalName: string; format: string; folderId: string | null };
type SheetRow = { id: string; name: string; data: SheetData; updatedAt: string };

type Tab = "cotas" | "planos" | "compartir";

export function ModelWorkspace(props: { model: ModelInfo; folders: { id: string; name: string }[]; dimensions: Dimension[]; sheets: SheetRow[]; shares: ShareRow[] }) {
  const { model } = props;
  const [tab, setTab] = useState<Tab>("cotas");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <FolderCrumb model={model} folders={props.folders} />
        <ModelTitle model={model} />
        <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as Tab)} variant="outline" size="sm">
          <ToggleGroupItem value="cotas">
            <Ruler /> Cotas 3D
          </ToggleGroupItem>
          <ToggleGroupItem value="planos">
            <FileText /> Planos ({props.sheets.length})
          </ToggleGroupItem>
          <ToggleGroupItem value="compartir">
            <Link2 /> Compartir
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href={`/api/models/${model.id}/file`}>
              <Download /> {model.originalName}
            </a>
          </Button>
          <DeleteModelButton id={model.id} name={model.name} />
        </div>
      </div>
      {tab === "cotas" && <DimensionsTab model={model} initial={props.dimensions} />}
      {tab === "planos" && <SheetsTab modelId={model.id} sheets={props.sheets} />}
      {tab === "compartir" && <SharesPanel target={{ modelId: model.id }} shares={props.shares} />}
    </div>
  );
}

/** Carpeta del modelo: enlace para volver y selector para moverlo. */
function FolderCrumb({ model, folders }: { model: ModelInfo; folders: { id: string; name: string }[] }) {
  const router = useRouter();
  const [value, setValue] = useState(model.folderId ?? "none");
  const [, start] = useTransition();
  const current = folders.find((f) => f.id === value);
  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link href={current ? `/admin/carpetas/${current.id}` : "/admin"} className="hover:text-foreground" title="Volver">
        <Folder className="size-4" />
      </Link>
      <Select
        value={value}
        onValueChange={(v) => {
          setValue(v);
          start(async () => {
            const r = await moveModel(model.id, v === "none" ? null : v);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Carpeta actualizada");
            router.refresh();
          });
        }}
      >
        <SelectTrigger size="sm" className="h-7 max-w-44 border-none px-1.5 shadow-none" aria-label="Carpeta">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sin carpeta</SelectItem>
          {folders.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ChevronRight className="size-3" />
    </div>
  );
}

function ModelTitle({ model }: { model: ModelInfo }) {
  const [name, setName] = useState(model.name);
  const [, start] = useTransition();
  return (
    <input
      className="min-w-0 max-w-xs rounded bg-transparent px-1 text-lg font-semibold outline-none hover:bg-muted focus:bg-muted"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() =>
        name.trim() !== model.name &&
        start(async () => {
          const r = await renameModel(model.id, name);
          if (!r.ok) toast.error(r.error);
        })
      }
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      aria-label="Nombre del modelo"
    />
  );
}

function DeleteModelButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          <Trash2 /> Borrar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Borrar «{name}»?</AlertDialogTitle>
          <AlertDialogDescription>Se borran también sus cotas, planos y enlaces. Los clientes dejarán de verlo.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={() => start(() => deleteModel(id))}>
            Borrar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Cotas 3D ──────────────────────────────────────────────────────────

const AXIS_LABEL: Record<DimensionAxis, string> = { aligned: "Alineada", x: "Eje X", y: "Eje Y", z: "Eje Z" };

function DimensionsTab({ model, initial }: { model: ModelInfo; initial: Dimension[] }) {
  const [dims, setDims] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [axis, setAxis] = useState<DimensionAxis>("aligned");
  const [unit, setUnit] = useUnit();
  const [showDims, setShowDims] = useState(true);
  const [draft, setDraft] = useState<MeasureDraft>({ a: null, b: null });
  const [bodies, setBodies] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pieces, setPieces] = useState<{ groups: PieceGroup[]; bodyGroup: number[] } | null>(null);
  const [colored, setColored] = useState(false);
  const [explode, setExplode] = useState(0);
  const bodyColors = useMemo(() => (colored && pieces ? pieces.bodyGroup.map((g) => pieces.groups[g].color) : null), [colored, pieces]);
  const core = useRef<ViewerCore | null>(null);
  const decimals = unit === "cm" ? 1 : 0;

  const create = useCallback(
    async (d: Omit<Dimension, "id">) => {
      const res = await fetch(`/api/models/${model.id}/dimensions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      if (!res.ok) return toast.error("No se pudo guardar la cota");
      const row = (await res.json()) as Dimension;
      setDims((list) => [...list, row]);
      setSelected(row.id);
    },
    [model.id],
  );

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/dimensions/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("No se pudo borrar la cota");
    setDims((list) => list.filter((d) => d.id !== id));
    setSelected((s) => (s === id ? null : s));
  }, []);

  const patch = useCallback(async (id: string, body: Partial<Pick<Dimension, "label" | "axis">>) => {
    const res = await fetch(`/api/dimensions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return toast.error("No se pudo guardar el cambio");
    const row = (await res.json()) as Dimension;
    setDims((list) => list.map((d) => (d.id === id ? row : d)));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") {
        if (draft.a) core.current?.cancelDraft();
        else setMeasuring(false);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected) remove(selected);
      else if (e.key.toLowerCase() === "m") setMeasuring((m) => !m);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft.a, selected, remove]);

  const step = explode > 0 ? "Vista explosionada: las cotas se ocultan (doble clic en el deslizador para armar)" : !measuring ? null : !draft.a ? "Haz clic en el primer punto" : !draft.b ? "Haz clic en el segundo punto" : "Mueve para ubicar la cota y haz clic";

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="relative min-h-[60svh] flex-1 p-2 lg:min-h-0">
        <ModelViewer
          meshUrl={`/api/models/${model.id}/mesh`}
          dimensions={dims}
          unit={unit}
          decimals={decimals}
          measuring={measuring}
          axis={axis}
          selectedId={selected}
          hiddenBodies={hidden}
          showDimensions={showDims}
          onSelect={setSelected}
          onCreate={create}
          onDraftChange={setDraft}
          onLoaded={({ bodies }) => {
            setBodies(bodies.map((b) => b.name));
            setPieces(groupPieces(bodies));
          }}
          bodyColors={bodyColors}
          explode={explode}
          onCore={(c) => (core.current = c)}
        />
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-1.5 shadow-sm">
            <Button
              size="sm"
              variant={measuring ? "default" : "outline"}
              onClick={() => {
                setExplode(0);
                setMeasuring((m) => !m);
              }}
              title="Medir (M)"
            >
              <Ruler /> {measuring ? "Midiendo" : "Medir"}
            </Button>
            <ToggleGroup type="single" size="sm" variant="outline" value={axis} onValueChange={(v) => v && setAxis(v as DimensionAxis)}>
              {(Object.keys(AXIS_LABEL) as DimensionAxis[]).map((k) => (
                <ToggleGroupItem key={k} value={k} title={AXIS_LABEL[k]}>
                  {k === "aligned" ? "Alineada" : k.toUpperCase()}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup type="single" size="sm" variant="outline" value={unit} onValueChange={(v) => v && setUnit(v as "mm" | "cm")}>
              <ToggleGroupItem value="cm">cm</ToggleGroupItem>
              <ToggleGroupItem value="mm">mm</ToggleGroupItem>
            </ToggleGroup>
            <Button size="icon-sm" variant={colored ? "default" : "ghost"} onClick={() => setColored((c) => !c)} title="Colorear piezas">
              <Palette />
            </Button>
            <ExplodeSlider
              value={explode}
              onChange={(v) => {
                setExplode(v);
                if (v > 0) setMeasuring(false);
              }}
            />
            <Button size="icon-sm" variant="ghost" onClick={() => setShowDims((s) => !s)} title={showDims ? "Ocultar cotas" : "Mostrar cotas"}>
              {showDims ? <Eye /> : <EyeOff />}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => core.current?.fit()} title="Encuadrar">
              <Maximize />
            </Button>
          </div>
        </div>
        {step && (
          <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
            <div className="rounded-full bg-black/75 px-3 py-1.5 text-xs text-white">
              {step}
              {explode === 0 && (
                <>
                  {" "}
                  · <kbd>Esc</kbd> cancela
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <aside className="flex w-full shrink-0 flex-col border-t lg:w-80 lg:border-t-0 lg:border-l">
        <div className="border-b p-3">
          <h2 className="text-sm font-semibold">Cotas ({dims.length})</h2>
          <p className="text-xs text-muted-foreground">
            Pulsa <b>Medir</b>, elige dos puntos (el imán se pega a vértices y aristas) y ubica la línea. Las ve tu cliente.
          </p>
        </div>
        <div className="max-h-[50svh] min-h-0 flex-1 overflow-y-auto lg:max-h-none">
          {dims.length === 0 && <p className="p-3 text-sm text-muted-foreground">Sin cotas todavía.</p>}
          <ul className="divide-y">
            {dims.map((d) => {
              const g = dim3d(d.a, d.b, d.offset, d.axis);
              return (
                <li
                  key={d.id}
                  className={cn("flex items-center gap-2 px-3 py-2 text-sm", selected === d.id && "bg-primary/5")}
                  onClick={() => setSelected(d.id)}
                >
                  <span className="w-16 shrink-0 font-mono font-semibold">{g ? formatLength(g.value, unit, decimals) : "—"}</span>
                  <Input
                    className="h-7 text-xs"
                    defaultValue={d.label ?? ""}
                    placeholder={AXIS_LABEL[d.axis]}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== d.label) patch(d.id, { label: v });
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    aria-label="Texto de la cota"
                  />
                  <Button size="icon-sm" variant="ghost" onClick={() => remove(d.id)} title="Borrar cota">
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
        {pieces && (
          <details className="border-t" open={colored}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Despiece ({pieces.groups.length} tipos)</summary>
            <div className="max-h-72 overflow-y-auto pb-2">
              <PiecesList groups={pieces.groups} unit={unit} decimals={decimals} />
            </div>
          </details>
        )}
        <details className="border-t">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Piezas ({bodies.length})</summary>
          <div className="flex gap-2 px-3 pb-2">
            <Button size="xs" variant="outline" onClick={() => setHidden(new Set())}>
              Mostrar todas
            </Button>
            <Button size="xs" variant="outline" onClick={() => setHidden(new Set(bodies))}>
              Ocultar todas
            </Button>
          </div>
          <ul className="max-h-64 overflow-y-auto px-3 pb-3 text-xs">
            {bodies.map((name, i) => (
              <li key={`${name}-${i}`}>
                <label className="flex items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={!hidden.has(name)}
                    onChange={(e) =>
                      setHidden((h) => {
                        const n = new Set(h);
                        if (e.target.checked) n.delete(name);
                        else n.add(name);
                        return n;
                      })
                    }
                  />
                  <span className="font-mono">{name}</span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      </aside>
    </div>
  );
}

// ── Planos ────────────────────────────────────────────────────────────

function SheetsTab({ modelId, sheets }: { modelId: string; sheets: SheetRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function create() {
    setPending(true);
    const res = await fetch(`/api/models/${modelId}/sheets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setPending(false);
    if (!res.ok) return toast.error("No se pudo crear el plano");
    const { id } = (await res.json()) as { id: string };
    router.push(`/admin/modelos/${modelId}/planos/${id}`);
  }
  async function remove(id: string) {
    const res = await fetch(`/api/sheets/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("No se pudo borrar");
    router.refresh();
  }
  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Planos</h2>
          <p className="text-sm text-muted-foreground">Láminas con vistas del modelo, cotas y rótulo, listas para imprimir o guardar en PDF.</p>
        </div>
        <Button onClick={create} disabled={pending}>
          <Plus /> Nuevo plano
        </Button>
      </div>
      {sheets.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Todavía no hay planos.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((s) => (
            <Card key={s.id} className="overflow-hidden pt-0">
              <Link href={`/admin/modelos/${modelId}/planos/${s.id}`} className="block border-b bg-muted/40 p-2">
                <SheetSvg data={s.data} className="h-auto w-full" />
              </Link>
              <CardHeader>
                <CardTitle className="text-base">{s.name}</CardTitle>
                <CardDescription>
                  {s.data.size} · {s.data.views.length} vistas · {s.data.dims.length} cotas · {new Date(s.updatedAt).toLocaleString("es-CL")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button size="sm" asChild>
                  <Link href={`/admin/modelos/${modelId}/planos/${s.id}`}>Editar</Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-destructive">
                      <Trash2 /> Borrar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Borrar «{s.name}»?</AlertDialogTitle>
                      <AlertDialogDescription>El plano dejará de estar disponible para tus clientes.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => remove(s.id)}>
                        Borrar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
