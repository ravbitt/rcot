import Link from "next/link";
import { Box, FileText } from "lucide-react";
import type { ModelCardData } from "@/lib/queries";

/** Portada de un proyecto compartido: sus modelos con miniatura. */
export function ProjectView({ token, name, models, showSheets }: { token: string; name: string; models: ModelCardData[]; showSheets: boolean }) {
  const t = encodeURIComponent(token);
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-6">
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {models.length} {models.length === 1 ? "modelo" : "modelos"} · elige uno para ver sus medidas{showSheets ? " y planos" : ""}
      </p>
      {models.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Este proyecto todavía no tiene modelos.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {models.map((m) => {
            const [min, max] = m.bbox;
            const size = [0, 1, 2].map((k) => Math.round((max[k] - min[k]) / 10)).join(" × ");
            return (
              <Link key={m.id} href={`/v/${token}/m/${m.id}`} className="overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/50">
                <div className="flex aspect-[4/3] items-center justify-center bg-muted/50">
                  {m.thumbFile ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura privada servida por la API
                    <img src={`/api/models/${m.id}/thumbnail?v=${m.thumbFile.slice(0, 8)}&t=${t}`} alt="" className="h-full w-full object-contain p-2" loading="lazy" />
                  ) : (
                    <Box className="size-10 text-muted-foreground/40" />
                  )}
                </div>
                <div className="border-t p-3">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="flex text-xs text-muted-foreground">
                    <span>{size} cm</span>
                    {showSheets && m.sheets > 0 && (
                      <span className="ml-auto flex items-center gap-1">
                        <FileText className="size-3" /> {m.sheets}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
