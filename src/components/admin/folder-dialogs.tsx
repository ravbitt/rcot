"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createFolder, deleteFolder, renameFolder } from "@/lib/actions";

function NameDialog(props: { trigger: React.ReactNode; title: string; initial?: string; submit: (name: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(props.initial ?? "");
  const [pending, start] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setName(props.initial ?? "");
      }}
    >
      <DialogTrigger asChild>{props.trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await props.submit(name);
              if (!r.ok) return void toast.error(r.error ?? "No se pudo guardar");
              setOpen(false);
            });
          }}
        >
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Seccional Hassan" maxLength={120} required />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewFolderButton() {
  const router = useRouter();
  return (
    <NameDialog
      title="Nueva carpeta"
      trigger={
        <Button variant="outline">
          <FolderPlus /> Nueva carpeta
        </Button>
      }
      submit={async (name) => {
        const r = await createFolder(name);
        if (r.ok && r.id) router.push(`/admin/carpetas/${r.id}`);
        return r;
      }}
    />
  );
}

export function FolderActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <NameDialog
        title="Renombrar carpeta"
        initial={name}
        trigger={
          <Button variant="ghost" size="sm">
            <Pencil /> Renombrar
          </Button>
        }
        submit={async (n) => {
          const r = await renameFolder(id, n);
          if (r.ok) router.refresh();
          return r;
        }}
      />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive">
            <Trash2 /> Borrar carpeta
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar la carpeta «{name}»?</AlertDialogTitle>
            <AlertDialogDescription>Sus modelos no se borran: quedan en «Sin carpeta».</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => start(() => deleteFolder(id))}>
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
