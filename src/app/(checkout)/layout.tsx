import { CheckoutHeader } from "@/components/shop/checkout/CheckoutHeader";
import { ShopShell } from "@/components/shop/ShopShell";

// Layout «Shop (упрощённый)» для /checkout (Блок 4): в шапке только логотип и «Вернуться в корзину».
// Группа маршрутов (checkout) не меняет URL — страница остаётся /checkout.
export default function CheckoutLayout({ children }: LayoutProps<"/">) {
  return <ShopShell header={<CheckoutHeader />}>{children}</ShopShell>;
}
