import Link from "next/link";
import type { StaticSection } from "@/components/shop/static/StaticPage";

export const deliverySections: StaticSection[] = [
  {
    id: "methods",
    title: "Способы и сроки",
    body: (
      <ul>
        <li>
          <strong>Курьер по Москве</strong> — 1–2 рабочих дня после подтверждения заказа.
        </li>
        <li>
          <strong>СДЭК — пункт выдачи</strong> — любой город России, 2–5 рабочих дней.
        </li>
        <li>
          <strong>СДЭК — до двери</strong> — любой город России, 2–5 рабочих дней.
        </li>
      </ul>
    ),
  },
  {
    id: "price",
    title: "Стоимость и страховка",
    body: <p>Доставка бесплатная, груз застрахован: объявленная стоимость равна сумме заказа.</p>,
  },
  {
    id: "area",
    title: "География",
    body: <p>Только по России.</p>,
  },
  {
    id: "payment",
    title: "Оплата",
    body: (
      <p>
        Оплата картой или через СБП, 100% предоплата. Подробнее об условиях — в{" "}
        <Link href="/offer">оферте</Link>.
      </p>
    ),
  },
];
