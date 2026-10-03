import type { Metadata } from "next";
import { StaticPage } from "@/components/shop/static/StaticPage";
import { deliverySections } from "@/content/delivery";

export const metadata: Metadata = {
  title: "Доставка и оплата — ForgeCarbon",
  description: "Курьер по Москве 1–2 дня, СДЭК по России 2–5 рабочих дней. Доставка бесплатная, груз застрахован.",
};

export default function DeliveryPage() {
  return <StaticPage title="Доставка и оплата" sections={deliverySections} />;
}
