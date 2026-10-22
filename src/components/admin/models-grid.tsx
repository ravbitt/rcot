import { ModelCard } from "@/components/admin/model-card";
import { ThumbnailBackfill } from "@/components/admin/thumbnail-backfill";
import type { ModelCardData } from "@/lib/queries";

/** Grilla de modelos; genera en el navegador las miniaturas que falten. */
export function ModelsGrid({ models, folders, currentFolder }: { models: ModelCardData[]; folders: { id: string; name: string }[]; currentFolder: string | null }) {
  const missing = models.filter((m) => !m.thumbFile).map((m) => m.id);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {models.map((m) => (
          <ModelCard key={m.id} m={m} folders={folders} currentFolder={currentFolder} />
        ))}
      </div>
      {missing.length > 0 && <ThumbnailBackfill key={missing.join(",")} ids={missing} />}
    </>
  );
}
