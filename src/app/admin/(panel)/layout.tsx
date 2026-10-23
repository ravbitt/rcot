import Link from "next/link";
import { Ruler } from "lucide-react";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { requireAdmin } from "@/lib/dal";

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return (
    <div className="flex min-h-svh flex-col">
      <header className="no-print flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Ruler className="size-4" />
          </span>
          Cotas
        </Link>
        <nav className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Proyectos
          </Link>
          <Link href="/admin/materiales" className="hover:text-foreground">
            Materiales
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{admin.email}</span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
