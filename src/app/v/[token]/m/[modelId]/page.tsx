import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelShareView } from "@/components/client/model-share-view";
import { shareModel } from "@/lib/dal";

export async function generateMetadata({ params }: PageProps<"/v/[token]/m/[modelId]">): Promise<Metadata> {
  const { token, modelId } = await params;
  return { title: (await shareModel(token, modelId))?.model.name ?? "Enlace no disponible" };
}

/** Un modelo dentro de un proyecto compartido. */
export default async function ShareModelPage({ params }: PageProps<"/v/[token]/m/[modelId]">) {
  const { token, modelId } = await params;
  const r = await shareModel(token, modelId);
  if (!r) notFound();
  const project = r.share.folder?.name;
  return <ModelShareView token={token} m={r.model} showSheets={r.share.share.showSheets} backHref={project ? `/v/${token}` : undefined} project={project} />;
}
