import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
import { AdminTopBar } from "@/components/admin/layout/AdminTopBar";
import { TooltipProvider } from "@/components/ui/tooltip";

interface AdminShellProps {
  email: string | null;
  children: ReactNode;
}

/** Каркас админки: sidebar (lg) / верхняя панель (< lg) + main. Страницы с нижней панелью ([data-sticky-panel]) получают отступ. */
export function AdminShell({ email, children }: AdminShellProps) {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen">
        <AdminSidebar email={email} />
        <div className="flex min-w-0 flex-1 flex-col max-lg:has-[[data-sticky-panel]]:pb-28">
          <AdminTopBar email={email} />
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
