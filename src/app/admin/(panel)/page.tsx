import type { Metadata } from "next";
import { FileBox } from "lucide-react";
import { FolderCard } from "@/components/admin/folder-card";
import { NewFolderButton } from "@/components/admin/folder-dialogs";
import { ModelsGrid } from "@/components/admin/models-grid";
import { UploadModelDialog } from "@/components/admin/upload-model-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireAdmin } from "@/lib/dal";
import { listFolders, listModels } from "@/lib/queries";

export const metadata: Metadata = { title: "Proyectos" };

export default async function HomePage() {
  await requireAdmin();
  const [folders, loose] = await Promise.all([listFolders(), listModels(null)]);
  const options = folders.map((f) => ({ id: f.id, name: f.name }));

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Proyectos</h1>
          <p className="text-sm text-muted-foreground">Agrupa los modelos de cada proyecto en carpetas. Sube STEP, IGES o STL, de a uno o varios.</p>
        </div>
        <div className="flex gap-2">
          <NewFolderButton />
          <UploadModelDialog folders={options} />
        </div>
      </div>

      {folders.length === 0 && loose.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileBox />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay nada</EmptyTitle>
            <EmptyDescription>Crea una carpeta para el proyecto y sube sus modelos: los STEP de SolidCraft conservan el nombre de cada pieza.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {folders.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase">Carpetas</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {folders.map((f) => (
              <FolderCard key={f.id} f={f} />
            ))}
          </div>
        </section>
      )}

      {loose.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase">Sin carpeta</h2>
          <ModelsGrid models={loose} folders={options} currentFolder={null} />
        </section>
      )}
    </main>
  );
}
