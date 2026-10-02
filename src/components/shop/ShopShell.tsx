import type { ReactNode } from "react";
import { SiteFooter } from "@/components/shop/SiteFooter";
import { TooltipProvider } from "@/components/ui/tooltip";

interface ShopShellProps {
  header: ReactNode;
  children: ReactNode;
}

/** Каркас витрины: шапка (общая или упрощённая для /checkout) + main + подвал. */
export function ShopShell({ header, children }: ShopShellProps) {
  return (
    <TooltipProvider>
      {/* Страницы с панелью, прибитой к низу экрана на mobile ([data-sticky-panel]), получают отступ — подвал не перекрывается. */}
      <div className="flex min-h-screen flex-col max-md:has-[[data-sticky-panel]]:pb-32">
        {header}
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </div>
    </TooltipProvider>
  );
}
