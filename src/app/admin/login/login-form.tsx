"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    const { error } = await authClient.signIn.email({
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    setPending(false);
    if (error) {
      // 401 = credenciales; cualquier otro código es un problema de configuración (p. ej. origen o URL) y se muestra tal cual
      if (error.status === 401) setError("Correo o contraseña incorrectos.");
      else if (error.status === 429) setError("Demasiados intentos. Espera un momento.");
      else setError(`No se pudo ingresar (${error.status}): ${error.message ?? error.statusText ?? "error desconocido"}`);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Ruler className="size-5" />
        </div>
        <CardTitle>Cotas</CardTitle>
        <CardDescription>Ingresa al panel de administración.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
