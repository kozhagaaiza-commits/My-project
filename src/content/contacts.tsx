import type { StaticSection } from "@/components/shop/static/StaticPage";

export const contactsSections = (telegramUrl: string, botUsername: string, email: string): StaticSection[] => [
  {
    id: "telegram",
    title: "Telegram",
    body: (
      <p>
        <a href={telegramUrl}>@{botUsername}</a>
      </p>
    ),
  },
  {
    id: "email",
    title: "Email",
    body: (
      <p>
        <a href={`mailto:${email}`}>{email}</a>
      </p>
    ),
  },
  {
    id: "warehouse",
    title: "Склад",
    body: <p>Склад: Москва. Точный адрес не публикуется, самовывоза нет.</p>,
  },
  {
    id: "hours",
    title: "Часы ответа",
    body: <p>10:00–20:00 МСК.</p>,
  },
];
