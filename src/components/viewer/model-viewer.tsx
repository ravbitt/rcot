"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchMesh, type Body } from "@/lib/geometry/mesh";
import { ViewerCore, type MeasureDraft } from "@/lib/viewer/core";
import type { Dimension, DimensionAxis, DimensionKind, MeshData } from "@/lib/types";

export type ModelViewerProps = {
  meshUrl: string;
  dimensions: Dimension[];
  unit: "mm" | "cm";
  decimals: number;
  measuring?: boolean;
  axis?: DimensionAxis;
  /** Tipo de cota que se mide: lineal o de un arco (radio, diámetro, longitud) */
  measureKind?: DimensionKind;
  selectedId?: string | null;
  hiddenBodies?: Set<string>;
  showDimensions?: boolean;
  /** Color de cada pieza (orden de los cuerpos) o null para el color madera */
  bodyColors?: string[] | null;
  /** Factor de explosión (0 = armado) */
  explode?: number;
  /** Claves de piezas: grupos del despiece y modo (una por tipo o todas), o null */
  pieceMarks?: { groups: { mark: string; color: string }[]; bodyGroup: number[]; mode: "type" | "all" } | null;
  onSelect?: (id: string | null) => void;
  onCreate?: (d: Omit<Dimension, "id">) => void;
  onDraftChange?: (draft: MeasureDraft) => void;
  onLoaded?: (info: { bodies: Body[]; data: MeshData }) => void;
  /** Entrega el visor al padre para pedirle acciones (encuadrar, cancelar la medición) */
  onCore?: (core: ViewerCore | null) => void;
};

export function ModelViewer(props: ModelViewerProps) {
  const box = useRef<HTMLDivElement>(null);
  const core = useRef<ViewerCore | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  // Los callbacks cambian en cada render: el visor llama siempre a los más recientes
  const cb = useRef(props);
  useEffect(() => {
    cb.current = props;
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const c = new ViewerCore(el, {
      onHoverBody: setHover,
      onSelectDimension: (id) => cb.current.onSelect?.(id),
      onCreateDimension: (d) => cb.current.onCreate?.(d),
      onDraftChange: (d) => cb.current.onDraftChange?.(d),
    });
    core.current = c;
    cb.current.onCore?.(c);
    let alive = true;
    fetchMesh(props.meshUrl)
      .then(({ data, bodies }) => {
        if (!alive) return;
        c.setModel(bodies);
        c.setFormat(cb.current.unit, cb.current.decimals);
        c.setDimensions(cb.current.dimensions);
        c.setBodyColors(cb.current.bodyColors ?? null);
        c.setExplode(cb.current.explode ?? 0);
        const pm = cb.current.pieceMarks;
        if (pm) c.setPieceMarks(pm, pm.mode);
        setStatus("ready");
        cb.current.onLoaded?.({ bodies, data });
      })
      .catch((err: Error) => {
        if (!alive) return;
        setError(err.message);
        setStatus("error");
      });
    return () => {
      alive = false;
      c.dispose();
      core.current = null;
      cb.current.onCore?.(null);
    };
    // El visor se crea una vez por modelo (los demás datos se leen de cb, siempre al día)
  }, [props.meshUrl]);

  useEffect(() => core.current?.setDimensions(props.dimensions), [props.dimensions]);
  useEffect(() => core.current?.setFormat(props.unit, props.decimals), [props.unit, props.decimals]);
  useEffect(() => core.current?.setSelected(props.selectedId ?? null), [props.selectedId]);
  useEffect(
    () => core.current?.setMeasuring(!!props.measuring, props.axis ?? "aligned", props.measureKind ?? "linear"),
    [props.measuring, props.axis, props.measureKind],
  );
  useEffect(() => core.current?.setHiddenBodies(props.hiddenBodies ?? new Set()), [props.hiddenBodies]);
  useEffect(() => core.current?.setDimensionsVisible(props.showDimensions ?? true), [props.showDimensions]);
  useEffect(() => core.current?.setBodyColors(props.bodyColors ?? null), [props.bodyColors]);
  useEffect(() => core.current?.setExplode(props.explode ?? 0), [props.explode]);
  useEffect(() => core.current?.setPieceMarks(props.pieceMarks ?? null, props.pieceMarks?.mode), [props.pieceMarks]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-[#f3f4f6]">
      <div ref={box} className="absolute inset-0" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando modelo…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-destructive">{error}</div>
      )}
      {hover && !props.measuring && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/70 px-2 py-1 font-mono text-xs text-white">{hover}</div>
      )}
    </div>
  );
}
