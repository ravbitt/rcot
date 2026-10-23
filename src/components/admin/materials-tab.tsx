"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PiecesList } from "@/components/viewer/pieces-list";
import { useUnit } from "@/hooks/use-unit";
import { setModelMaterials } from "@/lib/actions";
import { formatLength } from "@/lib/geometry/dim";
import { fetchMesh, type Body } from "@/lib/geometry/mesh";
import { groupPieces } from "@/lib/geometry/pieces";
import { assignGroup, suggestMaterial } from "@/lib/materials";
import type { Material, MaterialMap } from "@/lib/types";

const NONE = "none";
const MIXED = "mixed";

/**
 * Asignación de materiales por tipo de pieza. Los tipos se agrupan solo por geometría (como el despiece sin
 * materiales); el material se guarda por nombre de pieza, así sobrevive a reemplazar el archivo.
 */
export function MaterialsTab(props: {
  modelId: string;
  meshUrl: string;
  catalog: Material[];
  materials: MaterialMap;
  onChange: (m: MaterialMap) => void;
}) {
  const { catalog, materials, onChange } = props;
  const [unit] = useUnit();
  const [bodies, setBodies] = useState<Body[] | null>(null);
  const [pending, start] = useTransition();
  const decimals = unit === "cm" ? 1 : 0;

  useEffect(() => {
    let alive = true;
    fetchMesh(props.meshUrl)
      .then(({ bodies }) => alive && setBodies(bodies))
      .catch(() => toast.error("No se pudo cargar el modelo"));
    return () => {
      alive = false;
    };
  }, [props.meshUrl]);

  const types = useMemo(() => (bodies ? groupPieces(bodies).groups : []), [bodies]);
  const withMaterials = useMemo(() => (bodies ? groupPieces(bodies, materials).groups : []), [bodies, materials]);
  const known = new Set(catalog.map((m) => m.id));
  const valueOf = (names: string[]) => {
    const ids = new Set(names.map((n) => (known.has(materials[n]) ? materials[n] : NONE)));
    return ids.size > 1 ? MIXED : [...ids][0];
  };
  const unassigned = types.filter((g) => valueOf(g.names) === NONE);

  function save(next: MaterialMap) {
    const prev = materials;
    onChange(next);
    start(async () => {
      const r = await setModelMaterials(props.modelId, next);
      if (!r.ok) {
        onChange(prev);
        toast.error(r.error);
      }
    });
  }

  function applySuggestions() {
    let next = materials;
    let n = 0;
    for (const g of unassigned) {
      const s = suggestMaterial(g, catalog);
      if (s) {
        next = assignGroup(next, g.names, s);
        n++;
      }
    }
    if (!n) return toast.info("No hay sugerencias para las piezas sin material");
    save(next);
    toast.success(`Material sugerido en ${n} tipos de pieza. Revisa la lista.`);
  }

  if (!bodies) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando piezas…
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_20rem]">
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h2 className="text-lg font-semibold">Materiales</h2>
            <p className="text-sm text-muted-foreground">
              Elige el material de cada tipo de pieza. Se ve en el despiece, en el visor (Colorear → Material) y en las tablas de los planos.
            </p>
          </div>
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Button size="sm" variant="outline" onClick={applySuggestions} disabled={!unassigned.length || !catalog.length}>
            <Sparkles /> Sugerir para las sin material ({unassigned.length})
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/admin/materiales">
              <Settings /> Catálogo
            </Link>
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm" data-testid="materials-table">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Pieza</th>
                <th className="px-2 py-2 text-right font-medium">Cant.</th>
                <th className="px-2 py-2 text-right font-medium">L × A × E ({unit})</th>
                <th className="px-3 py-2 font-medium">Material</th>
              </tr>
            </thead>
            <tbody>
              {types.map((g) => {
                const value = valueOf(g.names);
                const suggestion = value === NONE ? catalog.find((m) => m.id === suggestMaterial(g, catalog)) : undefined;
                return (
                  <tr key={g.mark} className="border-t" title={g.names.join(", ")}>
                    <td className="px-3 py-1.5">
                      <b className="font-mono">{g.mark}</b> {g.name}
                      {g.curved && <span className="ml-1.5 rounded bg-muted px-1 text-[10px] text-muted-foreground">curva</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{g.qty}</td>
                    <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap">{g.dims.map((d) => formatLength(d, unit, decimals)).join("×")}</td>
                    <td className="px-3 py-1.5">
                      <Select value={value} onValueChange={(v) => v !== MIXED && save(assignGroup(materials, g.names, v === NONE ? null : v))}>
                        <SelectTrigger size="sm" className="w-48" aria-label={`Material de ${g.mark}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>
                            <span className="text-muted-foreground">{suggestion ? `Sin material (¿${suggestion.name}?)` : "Sin material"}</span>
                          </SelectItem>
                          {value === MIXED && <SelectItem value={MIXED}>Varios</SelectItem>}
                          {catalog.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <span className="inline-block size-3 rounded-sm border border-black/30" style={{ background: m.color }} />
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <aside>
        <h3 className="mb-2 text-sm font-semibold">Despiece con materiales</h3>
        <div className="rounded-lg border pb-2">
          <PiecesList groups={withMaterials} unit={unit} decimals={decimals} catalog={catalog} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Tableros y láminas en m² (largo × ancho de cada pieza; una lámina curva, su superficie desarrollada). Listones en metros lineales.
        </p>
      </aside>
    </div>
  );
}
