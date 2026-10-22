"use client";

import { Expand } from "lucide-react";

/** Deslizador de vista explosionada (0 = armado, 1,5 = muy separado). */
export function ExplodeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground" title="Vista explosionada">
      <Expand className="size-4 shrink-0" />
      <input
        type="range"
        min={0}
        max={1.5}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(0)}
        className="w-24 accent-primary"
        aria-label="Explosionar piezas"
      />
    </label>
  );
}
