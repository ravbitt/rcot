"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Eye, EyeOff, FileText, Maximize, Ruler } from "lucide-react";
import { SheetSvg } from "@/components/sheet/sheet-svg";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ModelViewer } from "@/components/viewer/model-viewer";
import { useUnit } from "@/hooks/use-unit";
import { dim3d, formatLength } from "@/lib/geometry/dim";
import type { ViewerCore } from "@/lib/viewer/core";
import type { Dimension, SheetData, Vec3 } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  token: string;
  model: { id: string; name: string; bbox: [Vec3, Vec3]; notes: string };
  dimensions: Dimension[];
  sheets: { id: string; name: string; data: SheetData }[];
};

/** Vista de solo lectura para el cliente: modelo 3D con cotas y planos. */
export function ClientView({ token, model, dimensions, sheets }: Props) {
  const [tab, setTab] = useState<"modelo" | "planos">("modelo");
  const [unit, setUnit] = useUnit();
  const [selected, setSelected] = useState<string | null>(null);
  const [showDims, setShowDims] = useState(true);
  const core = useRef<ViewerCore | null>(null);
  const decimals = unit === "cm" ? 1 : 0;
  const [min, max] = model.bbox;
  const size = [0, 1, 2].map((k) => formatLength(max[k] - min[k], unit, decimals)).join(" × ");

  return (
    <div className="flex h-svh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <div className="mr-2">
          <h1 className="font-semibold leading-tight">{model.name}</h1>
          <p className="text-xs text-muted-foreground">
            {size} {unit}
          </p>
        </div>
        {sheets.length > 0 && (
          <ToggleGroup type="single" size="sm" variant="outline" value={tab} onValueChange={(v) => v && setTab(v as "modelo" | "planos")}>
            <ToggleGroupItem value="modelo">
              <Ruler /> Modelo 3D
            </ToggleGroupItem>
            <ToggleGroupItem value="planos">
              <FileText /> Planos ({sheets.length})
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        <ToggleGroup className="ml-auto" type="single" size="sm" variant="outline" value={unit} onValueChange={(v) => v && setUnit(v as "mm" | "cm")}>
          <ToggleGroupItem value="cm">cm</ToggleGroupItem>
          <ToggleGroupItem value="mm">mm</ToggleGroupItem>
        </ToggleGroup>
      </header>

      {tab === "modelo" ? (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="relative min-h-[55svh] flex-1 p-2 md:min-h-0">
            <ModelViewer
              meshUrl={`/api/models/${model.id}/mesh?t=${encodeURIComponent(token)}`}
              dimensions={dimensions}
              unit={unit}
              decimals={decimals}
              selectedId={selected}
              showDimensions={showDims}
              onSelect={setSelected}
              onCore={(c) => (core.current = c)}
            />
            <div className="absolute top-4 right-4 flex gap-1 rounded-lg border bg-background/95 p-1 shadow-sm">
              <Button size="icon-sm" variant="ghost" onClick={() => setShowDims((s) => !s)} title={showDims ? "Ocultar cotas" : "Mostrar cotas"}>
                {showDims ? <Eye /> : <EyeOff />}
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => core.current?.fit()} title="Encuadrar">
                <Maximize />
              </Button>
            </div>
            <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              Arrastra para girar · rueda para acercar · clic derecho para desplazar
            </p>
          </div>
          {dimensions.length > 0 && (
            <aside className="max-h-[40svh] shrink-0 overflow-y-auto border-t md:max-h-none md:w-72 md:border-t-0 md:border-l">
              <h2 className="border-b p-3 text-sm font-semibold">Medidas</h2>
              <ul className="divide-y text-sm">
                {dimensions.map((d) => {
                  const g = dim3d(d.a, d.b, d.offset, d.axis);
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted", selected === d.id && "bg-primary/5")}
                        onClick={() => setSelected(d.id)}
                      >
                        <span className="w-16 font-mono font-semibold">{g ? formatLength(g.value, unit, decimals) : "—"}</span>
                        <span className="text-muted-foreground">{d.label ?? ""}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>
          )}
        </div>
      ) : (
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-6 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((s) => (
            <Link key={s.id} href={`/v/${token}/planos/${s.id}`} className="group overflow-hidden rounded-lg border bg-background">
              <div className="border-b bg-muted/40 p-2">
                <SheetSvg data={s.data} className="h-auto w-full" />
              </div>
              <div className="p-3 text-sm font-medium group-hover:underline">{s.name}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
