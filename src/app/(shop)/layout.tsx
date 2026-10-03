import { ShopShell } from "@/components/shop/ShopShell";
import { SiteHeader } from "@/components/shop/SiteHeader";

// Скрипт Яндекс Метрики подключается внутри ShopShell (MetrikaScript).
export default function ShopLayout({ children }: LayoutProps<"/">) {
  return <ShopShell header={<SiteHeader />}>{children}</ShopShell>;
}
