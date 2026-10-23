"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Box, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createShare, revokeFolderShare, revokeShare } from "@/lib/actions";
import { cn } from "@/lib/utils";

export type ShareRow = {
  id: string;
  token: string;
  label: string;
  showSheets: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  /** Calculado en el servidor al cargar la página */
  expired: boolean;
};


function shareUrl(token: string) {
  return `${window.location.origin}/v/${token}`;
}

/** Crear, copiar y revocar enlaces de cliente de un modelo o de un proyecto (carpeta). */
export function SharesPanel({ target, shares }: { target: { modelId: string } | { folderId: string }; shares: ShareRow[] }) {
  const isFolder = "folderId" in target;
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [showSheets, setShowSheets] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [pending, start] = useTransition();

  function copy(token: string) {
    navigator.clipboard.writeText(shareUrl(token)).then(
      () => toast.success("Enlace copiado"),
      () => toast.error("No se pudo copiar"),
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nuevo enlace</CardTitle>
          <CardDescription>
            {isFolder
              ? "Tu cliente ve todos los modelos del proyecto (y los que agregues después), con sus medidas y planos. No puede editar nada."
              : "Tu cliente ve el modelo y sus cotas sin cuenta. No puede editar nada."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createShare({ ...target, label, showSheets, expiresAt: expiresAt || null });
                if (!r.ok) return void toast.error(r.error);
                if (r.token) copy(r.token);
                setLabel("");
                router.refresh();
              });
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="label">Para quién (referencia)</Label>
              <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej.: Hassan — cotización" maxLength={120} />
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              Incluir planos
              <Switch checked={showSheets} onCheckedChange={setShowSheets} />
            </label>
            <div className="grid gap-2">
              <Label htmlFor="expires">Vence (opcional)</Label>
              <Input id="expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
            <Button type="submit" disabled={pending}>
              <Link2 /> Crear y copiar enlace
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid content-start gap-3">
        {shares.length === 0 && <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Sin enlaces.</p>}
        {shares.map((s) => {
          const expired = s.expired;
          const active = !s.revokedAt && !expired;
          return (
            <Card key={s.id} className={cn(!active && "opacity-60")}>
              <CardContent className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    {s.label || "Sin referencia"}
                    {s.revokedAt ? <Badge variant="secondary">Revocado</Badge> : expired ? <Badge variant="secondary">Vencido</Badge> : <Badge>Activo</Badge>}
                    {!s.showSheets && <Badge variant="outline">Sin planos</Badge>}
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">/v/{s.token}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.viewCount} visitas
                    {s.lastViewedAt && ` · última ${new Date(s.lastViewedAt).toLocaleString("es-CL")}`}
                    {s.expiresAt && ` · vence ${new Date(s.expiresAt).toLocaleDateString("es-CL")}`}
                  </div>
                </div>
                {active && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => copy(s.token)}>
                      <Copy /> Copiar
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`/v/${s.token}`} target="_blank" rel="noreferrer">
                        <Box /> Abrir
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() =>
                        start(async () => {
                          await (isFolder ? revokeFolderShare(s.id, target.folderId) : revokeShare(s.id, target.modelId));
                          router.refresh();
                        })
                      }
                    >
                      Revocar
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
