"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UploadModelDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setProgress(0);
    // XHR para mostrar el progreso de subida (los STEP pueden pesar varios MB)
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/models");
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => {
      setPending(false);
      const res = JSON.parse(xhr.responseText || "{}") as { id?: string; error?: string };
      if (xhr.status >= 300 || !res.id) {
        toast.error(res.error ?? "No se pudo subir el modelo");
        return;
      }
      toast.success("Modelo listo");
      setOpen(false);
      router.push(`/admin/modelos/${res.id}`);
    };
    xhr.onerror = () => {
      setPending(false);
      toast.error("Error de red al subir");
    };
    xhr.send(form);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button>
          <Upload /> Subir modelo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir modelo</DialogTitle>
          <DialogDescription>STEP, IGES o STL en milímetros. Se convierte una vez para el visor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="file">Archivo</Label>
            <Input id="file" name="file" type="file" accept=".step,.stp,.iges,.igs,.stl" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="name">Nombre (opcional)</Label>
            <Input id="name" name="name" placeholder="Se usa el nombre del archivo" maxLength={120} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? (progress < 100 ? `Subiendo ${progress}%…` : "Convirtiendo…") : "Subir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
