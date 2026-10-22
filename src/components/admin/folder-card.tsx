import Link from "next/link";
import { Folder } from "lucide-react";
import type { FolderCardData } from "@/lib/queries";

/** Carpeta con un mosaico de hasta 4 miniaturas de sus modelos. */
export function FolderCard({ f }: { f: FolderCardData }) {
  return (
    <Link href={`/admin/carpetas/${f.id}`} className="group block overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/50">
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-px bg-border">
        {[0, 1, 2, 3].map((i) => {
          const t = f.thumbs[i];
          return (
            <div key={i} className="flex items-center justify-center bg-muted/40">
              {t ? (
                // eslint-disable-next-line @next/next/no-img-element -- miniatura privada servida por la API
                <img src={`/api/models/${t.id}/thumbnail?v=${t.thumbFile.slice(0, 8)}`} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
              ) : i === 0 && f.thumbs.length === 0 ? (
                <Folder className="size-8 text-muted-foreground/40" />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-t p-3">
        <Folder className="size-4 shrink-0 text-primary" />
        <span className="truncate font-medium">{f.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {f.models} {f.models === 1 ? "modelo" : "modelos"}
        </span>
      </div>
    </Link>
  );
}
