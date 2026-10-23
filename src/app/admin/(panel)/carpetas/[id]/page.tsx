import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileBox } from "lucide-react";
import { FolderActions } from "@/components/admin/folder-dialogs";
import { FolderShareDialog } from "@/components/admin/folder-share-dialog";
import { db } from "@/db";
import { share } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ModelsGrid } from "@/components/admin/models-grid";
import { UploadModelDialog } from "@/components/admin/upload-model-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireAdmin } from "@/lib/dal";
import { folderOptions, getFolder, listModels } from "@/lib/queries";

/** ¿Ya pasó la fecha? (vencimiento de un enlace) */
const isPast = (d: Date | null) => !!d && d.getTime() < Date.now();

export async function generateMetadata({ params }: PageProps<"/admin/carpetas/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: (await getFolder(id))?.name ?? "Carpeta" };
}

export default async function FolderPage({ params }: PageProps<"/admin/carpetas/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const f = await getFolder(id);
  if (!f) notFound();
  const [models, options, shares] = await Promise.all([
    listModels(id),
    folderOptions(),
    db.select().from(share).where(eq(share.folderId, id)).orderBy(desc(share.createdAt)),
  ]);
  const shareRows = shares.map((s) => ({
    id: s.id,
    token: s.token,
    label: s.label,
    showSheets: s.showSheets,
    expiresAt: s.expiresAt?.toISOString() ?? null,
    revokedAt: s.revokedAt?.toISOString() ?? null,
    viewCount: s.viewCount,
    lastViewedAt: s.lastViewedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    expired: isPast(s.expiresAt),
  }));

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-6">
      <nav className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/admin" className="hover:text-foreground">
          Proyectos
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground">{f.name}</span>
      </nav>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{f.name}</h1>
          <p className="text-sm text-muted-foreground">
            {models.length} {models.length === 1 ? "modelo" : "modelos"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FolderActions id={f.id} name={f.name} />
          <FolderShareDialog folderId={f.id} name={f.name} shares={shareRows} />
          <UploadModelDialog folders={options} defaultFolder={f.id} />
        </div>
      </div>
      {models.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileBox />
            </EmptyMedia>
            <EmptyTitle>Carpeta vacía</EmptyTitle>
            <EmptyDescription>
              Sube los modelos de este proyecto (puedes elegir varios archivos a la vez) o muévelos desde «Sin carpeta».
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ModelsGrid models={models} folders={options} currentFolder={f.id} />
      )}
    </main>
  );
}
