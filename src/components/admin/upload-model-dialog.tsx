"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createThumbnail } from "@/lib/drawing/thumbnail";
import { fetchMesh } from "@/lib/geometry/mesh";

type Item = { file: File; status: "pending" | "uploading" | "converting" | "thumb" | "done" | "error"; progress: number; error?: string; id?: string };

const STATUS: Record<Item["status"], string> = {
  pending: "En cola",
  uploading: "Subiendo",
  converting: "Convirtiendo",
  thumb: "Miniatura",
  done: "Listo",
  error: "Error",
};

/** Sube un archivo con progreso (XHR) y devuelve el id del modelo. */
function uploadOne(file: File, folderId: string | null, onProgress: (p: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const form = new FormData();
    form.set("file", file);
    if (folderId) form.set("folderId", folderId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/models");
    xhr.upload.onprogress = (ev) => ev.lengthComputable && onProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => {
      let res: { id?: string; error?: string } = {};
      try {
        res = JSON.parse(xhr.responseText || "{}");
      } catch {}
      if (xhr.status >= 300 || !res.id) reject(new Error(res.error ?? `Error ${xhr.status}`));
      else resolve(res.id);
    };
    xhr.onerror = () => reject(new Error("Error de red"));
    xhr.send(form);
  });
}

export function UploadModelDialog({ folders, defaultFolder = null }: { folders: { id: string; name: string }[]; defaultFolder?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [folderId, setFolderId] = useState<string>(defaultFolder ?? "none");
  const [running, setRunning] = useState(false);
  const set = (i: number, patch: Partial<Item>) => setItems((list) => list.map((it, k) => (k === i ? { ...it, ...patch } : it)));

  async function run() {
    setRunning(true);
    const target = folderId === "none" ? null : folderId;
    const ids: string[] = [];
    // Uno por uno: la conversión es pesada para el servidor
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === "done") continue;
      try {
        set(i, { status: "uploading", progress: 0, error: undefined });
        const id = await uploadOne(items[i].file, target, (p) => set(i, { progress: p, status: p < 100 ? "uploading" : "converting" }));
        set(i, { status: "thumb", id });
        await createThumbnail(id, async () => (await fetchMesh(`/api/models/${id}/mesh`)).bodies).catch((err) => console.error("miniatura", err));
        set(i, { status: "done" });
        ids.push(id);
      } catch (err) {
        set(i, { status: "error", error: (err as Error).message });
      }
    }
    setRunning(false);
    router.refresh();
    if (ids.length) toast.success(ids.length === 1 ? "Modelo listo" : `${ids.length} modelos listos`);
    if (ids.length === 1 && items.length === 1) {
      setOpen(false);
      router.push(`/admin/modelos/${ids[0]}`);
    }
  }

  const failed = items.some((i) => i.status === "error");
  const allDone = items.length > 0 && items.every((i) => i.status === "done");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (running) return;
        setOpen(o);
        if (o) {
          setItems([]);
          setFolderId(defaultFolder ?? "none");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Upload /> Subir modelos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir modelos</DialogTitle>
          <DialogDescription>STEP, IGES o STL en milímetros. Puedes elegir varios archivos a la vez.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="files">Archivos</Label>
            <Input
              id="files"
              type="file"
              multiple
              accept=".step,.stp,.iges,.igs,.stl"
              disabled={running}
              onChange={(e) => setItems([...(e.target.files ?? [])].map((file) => ({ file, status: "pending", progress: 0 })))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Carpeta</Label>
            <Select value={folderId} onValueChange={setFolderId} disabled={running}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin carpeta</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {items.length > 0 && (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-sm" data-testid="upload-list">
              {items.map((it, i) => (
                <li key={`${it.file.name}-${i}`} className="flex items-center gap-2 px-3 py-2">
                  {it.status === "done" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                  ) : it.status === "error" ? (
                    <CircleAlert className="size-4 shrink-0 text-destructive" />
                  ) : it.status === "pending" ? (
                    <span className="size-4 shrink-0" />
                  ) : (
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{it.file.name}</span>
                  <span className={it.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {it.status === "error" ? it.error : it.status === "uploading" ? `${STATUS.uploading} ${it.progress}%` : STATUS[it.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          {allDone ? (
            <Button onClick={() => setOpen(false)}>Cerrar</Button>
          ) : (
            <Button onClick={run} disabled={running || items.length === 0}>
              {running ? "Subiendo…" : failed ? "Reintentar los fallidos" : items.length > 1 ? `Subir ${items.length} archivos` : "Subir"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
