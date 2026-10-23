"use client";

import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MarksMode = "type" | "all" | null;

/** Claves de piezas en el visor: apagadas, una por tipo o en todas las piezas. */
export function MarksControl({ value, onChange }: { value: MarksMode; onChange: (v: MarksMode) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <Button size="icon-sm" variant={value ? "default" : "ghost"} onClick={() => onChange(value ? null : "type")} title="Claves de piezas">
        <Tag />
      </Button>
      {value && (
        <div className="flex rounded-md border text-xs">
          {(
            [
              ["type", "Por tipo"],
              ["all", "Todas"],
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
