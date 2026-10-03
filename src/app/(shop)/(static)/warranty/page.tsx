import type { Metadata } from "next";
import { StaticPage } from "@/components/shop/static/StaticPage";
import { warrantySections } from "@/content/warranty";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Гарантия и возврат — ForgeCarbon",
  description: "Порядок обращения по гарантии и возврат товара надлежащего качества в течение 7 дней.",
};

export default function WarrantyPage() {
  return (
    <StaticPage
      title="Гарантия и возврат"
      sections={warrantySections(`https://t.me/${env.TELEGRAM_BOT_USERNAME}`, env.SMTP_USER)}
    />
  );
}
