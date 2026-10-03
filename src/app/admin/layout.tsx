import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/layout/AdminShell";
import { SITE_NAME } from "@/lib/config";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: `Админка — ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

// Серверная проверка роли admin (не вошёл → /auth/login, не admin → 404) — в requireAdminPage().
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { email } = await requireAdminPage();
  return <AdminShell email={email}>{children}</AdminShell>;
}
