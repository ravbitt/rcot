"use client";

import { Link2 } from "lucide-react";
import { SharesPanel, type ShareRow } from "@/components/admin/shares-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Enlaces del proyecto entero (todos los modelos de la carpeta). */
export function FolderShareDialog({ folderId, name, shares }: { folderId: string; name: string; shares: ShareRow[] }) {
  const active = shares.filter((s) => !s.revokedAt && !s.expired).length;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 /> Compartir proyecto{active ? ` (${active})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Compartir «{name}»</DialogTitle>
          <DialogDescription>Un solo enlace para todo el proyecto: el cliente elige el modelo y ve sus medidas, despiece y planos.</DialogDescription>
        </DialogHeader>
        <SharesPanel target={{ folderId }} shares={shares} />
      </DialogContent>
    </Dialog>
  );
}
