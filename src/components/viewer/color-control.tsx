"use client";

import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ColorMode = "piece" | "material" | null;

/** Colores del visor: madera, uno por tipo de pieza o uno por material (si el modelo tiene materiales). */
export function ColorControl({ value, onChange, materials }: { value: ColorMode; onChange: (v: ColorMode) => void; materials: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      <Button size="icon-sm" variant={value ? "default" : "ghost"} onClick={() => onChange(value ? null : materials ? "material" : "piece")} title="Colorear">
        <Palette />
      </Button>
      {value && materials && (
        <div className="flex rounded-md border text-xs">
          {(
            [
              ["piece", "Pieza"],
              ["material", "Material"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={`px-2 py-1 first:rounded-l-md last:rounded-r-md ${value === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
