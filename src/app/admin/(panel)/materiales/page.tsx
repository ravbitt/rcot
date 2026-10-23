import type { Metadata } from "next";
import { MaterialsCatalog } from "@/components/admin/materials-catalog";
import { requireAdmin } from "@/lib/dal";
import { listMaterials } from "@/lib/queries";

export const metadata: Metadata = { title: "Materiales" };

export default async function MaterialsPage() {
  await requireAdmin();
  return <MaterialsCatalog materials={await listMaterials()} />;
}
