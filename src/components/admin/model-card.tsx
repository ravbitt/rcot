"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Box, FolderInput, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { moveModel } from "@/lib/actions";
import type { ModelCardData } from "@/lib/queries";

type Folder = { id: string; name: string };

export function ModelCard({ m, folders, currentFolder }: { m: ModelCardData; folders: Folder[]; currentFolder: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [min, max] = m.bbox;
  const size = [0, 1, 2].map((k) => Math.round(max[k] - min[k])).join(" × ");
  const move = (folderId: string | null) =>
    start(async () => {
      const r = await moveModel(m.id, folderId);
      if (!r.ok) return void toast.error(r.error);
      toast.success(folderId ? `Movido a «${folders.find((f) => f.id === folderId)?.name}»` : "Movido a «Sin carpeta»");
      router.refresh();
    });
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/50" aria-busy={pending}>
      <Link href={`/admin/modelos/${m.id}`} className="block">
        <div className="flex aspect-[4/3] items-center justify-center bg-muted/50">
          {m.thumbFile ? (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura privada servida por la API
            <img src={`/api/models/${m.id}/thumbnail?v=${m.thumbFile.slice(0, 8)}`} alt="" className="h-full w-full object-contain p-2" loading="lazy" />
          ) : (
            <Box className="size-10 text-muted-foreground/40" />
          )}
        </div>
        <div className="border-t p-3">
          <div className="truncate pr-8 font-medium">{m.name}</div>
          <div className="text-xs text-muted-foreground">{size} mm</div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>{m.bodyCount} piezas</span>
            <span>{m.dims} cotas</span>
            <span>{m.sheets} planos</span>
            <span className="ml-auto uppercase">{m.format}</span>
          </div>
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" className="absolute right-2 bottom-12" aria-label="Acciones">
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="truncate">{m.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput /> Mover a…
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {folders
                .filter((f) => f.id !== currentFolder)
                .map((f) => (
                  <DropdownMenuItem key={f.id} onSelect={() => move(f.id)}>
                    {f.name}
                  </DropdownMenuItem>
                ))}
              {currentFolder && (
                <>
                  {folders.length > 1 && <DropdownMenuSeparator />}
                  <DropdownMenuItem onSelect={() => move(null)}>Sin carpeta</DropdownMenuItem>
                </>
              )}
              {!currentFolder && folders.length === 0 && <DropdownMenuItem disabled>No hay carpetas</DropdownMenuItem>}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
