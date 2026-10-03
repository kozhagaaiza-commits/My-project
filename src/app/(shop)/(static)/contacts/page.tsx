import type { Metadata } from "next";
import { StaticPage } from "@/components/shop/static/StaticPage";
import { contactsSections } from "@/content/contacts";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Контакты — ForgeCarbon",
  description: "Telegram, email и часы ответа ForgeCarbon. Склад в Москве.",
};

export default function ContactsPage() {
  return (
    <StaticPage
      title="Контакты"
      sections={contactsSections(`https://t.me/${env.TELEGRAM_BOT_USERNAME}`, env.TELEGRAM_BOT_USERNAME, env.SMTP_USER)}
    />
  );
}
