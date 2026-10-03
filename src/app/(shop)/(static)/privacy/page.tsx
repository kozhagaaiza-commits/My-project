import type { Metadata } from "next";
import { StaticPage } from "@/components/shop/static/StaticPage";
import { privacySections, privacyVersion } from "@/content/privacy";

export const metadata: Metadata = {
  title: "Политика обработки персональных данных — ForgeCarbon",
  description: "Какие данные мы собираем, зачем, как долго храним и как отозвать согласие.",
};

export default function PrivacyPage() {
  return (
    <StaticPage
      title="Политика обработки персональных данных"
      lead={`Версия политики: ${privacyVersion}`}
      sections={privacySections}
    />
  );
}
