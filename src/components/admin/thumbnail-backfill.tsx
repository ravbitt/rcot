"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { createThumbnail } from "@/lib/drawing/thumbnail";
import { fetchMesh } from "@/lib/geometry/mesh";

/** Genera en segundo plano las miniaturas que faltan (modelos subidos antes de que existieran). */
export function ThumbnailBackfill({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [left, setLeft] = useState(ids.length);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !ids.length) return;
    started.current = true;
    (async () => {
      for (const id of ids) {
        try {
          await createThumbnail(id, async () => (await fetchMesh(`/api/models/${id}/mesh`)).bodies);
        } catch (err) {
          console.error("miniatura", id, err);
        }
        setLeft((n) => n - 1);
      }
      router.refresh();
    })();
  }, [ids, router]);
  if (left <= 0) return null;
  return (
    <div className="fixed right-4 bottom-4 flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs shadow">
      <Loader2 className="size-3 animate-spin" /> Generando miniaturas… {left}
    </div>
  );
}
