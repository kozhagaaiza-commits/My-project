import type { Metadata } from "next";
import { StaticPage } from "@/components/shop/static/StaticPage";
import { offerSections } from "@/content/offer";

export const metadata: Metadata = {
  title: "Публичная оферта — ForgeCarbon",
  description: "Условия продажи: предмет, оформление заказа, 100% предоплата, доставка и возврат.",
};

export default function OfferPage() {
  return <StaticPage title="Публичная оферта" sections={offerSections} />;
}
