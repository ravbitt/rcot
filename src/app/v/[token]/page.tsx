import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelShareView } from "@/components/client/model-share-view";
import { ProjectView } from "@/components/client/project-view";
import { getShare, touchShare } from "@/lib/dal";
import { listModels } from "@/lib/queries";

export async function generateMetadata({ params }: PageProps<"/v/[token]">): Promise<Metadata> {
  const { token } = await params;
  const s = await getShare(token);
  return { title: s?.model?.name ?? s?.folder?.name ?? "Enlace no disponible" };
}

export default async function SharePage({ params }: PageProps<"/v/[token]">) {
  const { token } = await params;
  const s = await getShare(token);
  if (!s) notFound();
  await touchShare(s.share.id);
  if (s.folder) {
    const models = await listModels(s.folder.id);
    return <ProjectView token={token} name={s.folder.name} models={models} showSheets={s.share.showSheets} />;
  }
  return <ModelShareView token={token} m={s.model!} showSheets={s.share.showSheets} />;
}
