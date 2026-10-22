export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Enlace no disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">El enlace venció o fue desactivado. Pide uno nuevo a quien te lo envió.</p>
      </div>
    </main>
  );
}
