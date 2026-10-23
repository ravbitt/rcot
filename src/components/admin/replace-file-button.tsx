"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createThumbnail } from "@/lib/drawing/thumbnail";
import { fetchMesh } from "@/lib/geometry/mesh";

type Res = { ok?: boolean; error?: string; duplicate?: { id: string; name: string }; lostMaterials?: string[] };

/** Sube una versión nueva del archivo del modelo conservando sus cotas, planos, enlaces y materiales. */
export function ReplaceFileButton({ modelId }: { modelId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  async function send(force: boolean) {
    if (!file) return;
    setBusy("Subiendo y convirtiendo…");
    try {
      const form = new FormData();
      form.set("file", file);
      if (force) form.set("force", "1");
      const r = await fetch(`/api/models/${modelId}/file`, { method: "PUT", body: form });
      const res = (await r.json().catch(() => ({}))) as Res;
      if (r.status === 409 && res.duplicate) return setDuplicate(res.duplicate);
      if (!r.ok) return void toast.error(res.error ?? `Error ${r.status}`);
      setBusy("Miniatura…");
      await createThumbnail(modelId, async () => (await fetchMesh(`/api/models/${modelId}/mesh`)).bodies).catch((err) => console.error("miniatura", err));
      setOpen(false);
      toast.success("Archivo reemplazado", {
        description: "Las cotas, planos, enlaces y materiales se conservaron. En los planos, usa «Regenerar» en cada vista para redibujarla.",
      });
      if (res.lostMaterials?.length) {
        toast.warning(`${res.lostMaterials.length} piezas con material ya no están en el archivo`, { description: res.lostMaterials.slice(0, 6).join(", ") });
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        setFile(null);
        setDuplicate(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <FileUp /> Reemplazar archivo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reemplazar archivo</DialogTitle>
          <DialogDescription>
            Sube la versión nueva del modelo (STEP, IGES o STL). Se conservan las cotas, los planos, los enlaces y los materiales de las piezas que mantienen su
            nombre. Si la geometría cambió, revisa las cotas y regenera las vistas de los planos.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="file"
          accept=".step,.stp,.iges,.igs,.stl"
          disabled={!!busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setDuplicate(null);
          }}
          aria-label="Archivo nuevo"
        />
        {duplicate && (
          <p className="text-sm text-amber-700" data-testid="replace-duplicate">
            Ese archivo ya está subido como «{duplicate.name}». ¿Reemplazar igual?
          </p>
        )}
        <DialogFooter>
          <Button onClick={() => send(!!duplicate)} disabled={!file || !!busy}>
            {busy ? (
              <>
                <Loader2 className="animate-spin" /> {busy}
              </>
            ) : duplicate ? (
              "Reemplazar igual"
            ) : (
              "Reemplazar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
