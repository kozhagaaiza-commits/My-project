import { SiteFooter } from "@/components/shop/SiteFooter";
import { SiteHeader } from "@/components/shop/SiteHeader";
import { TooltipProvider } from "@/components/ui/tooltip";

// Скрипт Яндекс Метрики подключается в День 7.
export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <TooltipProvider>
      {/* Страницы с панелью, прибитой к низу экрана на mobile ([data-sticky-panel]), получают отступ — подвал не перекрывается. */}
      <div className="flex min-h-screen flex-col max-md:has-[[data-sticky-panel]]:pb-32">
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </div>
    </TooltipProvider>
  );
}
