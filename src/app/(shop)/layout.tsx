import { SiteFooter } from "@/components/shop/SiteFooter";
import { SiteHeader } from "@/components/shop/SiteHeader";
import { TooltipProvider } from "@/components/ui/tooltip";

// Скрипт Яндекс Метрики подключается в День 7.
export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </div>
    </TooltipProvider>
  );
}
