import { requireAdmin } from "@/lib/dal";

export default async function PrintLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return children;
}
