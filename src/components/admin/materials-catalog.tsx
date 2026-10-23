"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createMaterial, deleteMaterial, updateMaterial } from "@/lib/actions";
import { KIND_LABEL } from "@/lib/materials";
import type { Material, MaterialKind } from "@/lib/types";

const KIND_HINT: Record<MaterialKind, string> = { tablero: "m²", liston: "metros", lamina: "m²", otro: "unidades" };

/** Catálogo de materiales del taller: nombre, color, tipo (cómo se suma) y espesor (para sugerir). */
export function MaterialsCatalog({ materials }: { materials: Material[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function add() {
    start(async () => {
      const r = await createMaterial({ name: "Material nuevo", color: "#9ca3af", kind: "tablero", thickness: 18 });
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Materiales</h1>
          <p className="text-sm text-muted-foreground">
            El tipo define cómo se suma en el despiece (tableros y láminas en m², listones en metros). El espesor sirve para sugerir el material de cada pieza.
          </p>
        </div>
        <Button onClick={add} disabled={pending}>
          <Plus /> Agregar
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Color</th>
              <th className="px-2 py-2 font-medium">Nombre</th>
              <th className="px-2 py-2 font-medium">Tipo</th>
              <th className="px-2 py-2 font-medium">Espesor (mm)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <MaterialRow key={m.id} m={m} />
            ))}
          </tbody>
        </table>
        {!materials.length && <p className="p-6 text-center text-sm text-muted-foreground">Sin materiales.</p>}
      </div>
    </div>
  );
}

function MaterialRow({ m }: { m: Material }) {
  const router = useRouter();
  const [draft, setDraft] = useState(m);
  const [, start] = useTransition();

  function save(next: Material) {
    setDraft(next);
    start(async () => {
      const r = await updateMaterial(m.id, { name: next.name, color: next.color, kind: next.kind, thickness: next.thickness });
      if (!r.ok) {
        setDraft(m);
        return void toast.error(r.error);
      }
      router.refresh();
    });
  }

  return (
    <tr className="border-t">
      <td className="px-3 py-1.5">
        <input
          type="color"
          className="h-7 w-10 cursor-pointer rounded border bg-transparent"
          value={draft.color}
          onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          onBlur={() => draft.color !== m.color && save(draft)}
          aria-label={`Color de ${m.name}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          className="h-8"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onBlur={() => draft.name.trim() !== m.name && save({ ...draft, name: draft.name.trim() })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Nombre"
        />
      </td>
      <td className="px-2 py-1.5">
        <Select value={draft.kind} onValueChange={(v) => save({ ...draft, kind: v as MaterialKind })}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABEL) as MaterialKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABEL[k]} <span className="text-muted-foreground">({KIND_HINT[k]})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1.5">
        <Input
          className="h-8 w-24"
          type="number"
          min={0}
          step={0.5}
          value={draft.thickness ?? ""}
          placeholder="—"
          onChange={(e) => setDraft({ ...draft, thickness: e.target.value === "" ? null : Number(e.target.value) })}
          onBlur={() => draft.thickness !== m.thickness && save(draft)}
          aria-label="Espesor"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon-sm" variant="ghost" className="text-destructive" title="Borrar">
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Borrar «{m.name}»?</AlertDialogTitle>
              <AlertDialogDescription>Las piezas que lo tengan quedarán sin material.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  start(async () => {
                    const r = await deleteMaterial(m.id);
                    if (!r.ok) return void toast.error(r.error);
                    router.refresh();
                  })
                }
              >
                Borrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}
