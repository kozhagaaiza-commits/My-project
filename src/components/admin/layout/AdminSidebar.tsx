import Link from "next/link";
import { AdminNav } from "@/components/admin/layout/AdminNav";
import { SITE_NAME } from "@/lib/config";

interface AdminSidebarProps {
  email: string | null;
}

/** Desktop (≥ lg): левый sidebar 240 px (Чертёж, 4.1). */
export function AdminSidebar({ email }: AdminSidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-border bg-card p-4 lg:flex">
      <Link href="/admin" className="px-3 pt-2 font-mono text-sm tracking-widest text-foreground uppercase">
        {SITE_NAME}
        <span className="block text-xs tracking-normal text-muted-foreground normal-case">Админка</span>
      </Link>
      <AdminNav />
      <div className="mt-auto flex flex-col gap-1 px-3 text-xs text-muted-foreground">
        {email && <span className="truncate" title={email}>{email}</span>}
        <Link href="/" className="text-silver underline-offset-4 hover:underline">
          На сайт
        </Link>
      </div>
    </aside>
  );
}
