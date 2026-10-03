import Link from "next/link";
import type { StaticSection } from "@/components/shop/static/StaticPage";
import { legalValue, SELLER_EMAIL, SELLER_INN, SELLER_NAME, SELLER_OGRNIP } from "@/lib/legal";

export const offerSections: StaticSection[] = [
  {
    id: "seller",
    title: "Продавец",
    body: (
      <ul>
        <li>{legalValue(SELLER_NAME)}</li>
        <li>ИНН: {legalValue(SELLER_INN)}</li>
        <li>ОГРНИП: {legalValue(SELLER_OGRNIP)}</li>
      </ul>
    ),
  },
  {
    id: "subject",
    title: "Предмет",
    body: <p>Продавец передаёт покупателю кованые и литые диски со склада в Москве и карбоновые детали под заказ, покупатель оплачивает их.</p>,
  },
  {
    id: "order",
    title: "Оформление и оплата",
    body: <p>Заказ оформляется на сайте. Оплата — 100% предоплата картой или через СБП. Товар бронируется на время оплаты.</p>,
  },
  {
    id: "delivery",
    title: "Доставка",
    body: (
      <p>
        Доставка бесплатная, только по России. Способы и сроки — на странице <Link href="/delivery">«Доставка и оплата»</Link>.
      </p>
    ),
  },
  {
    id: "return",
    title: "Возврат",
    body: (
      <p>
        Условия возврата и гарантии — на странице <Link href="/warranty">«Гарантия и возврат»</Link>.
      </p>
    ),
  },
  {
    id: "details",
    title: "Реквизиты",
    body: (
      <ul>
        <li>{legalValue(SELLER_NAME)}</li>
        <li>ИНН: {legalValue(SELLER_INN)}</li>
        <li>ОГРНИП: {legalValue(SELLER_OGRNIP)}</li>
        <li>
          Email: <a href={`mailto:${SELLER_EMAIL}`}>{legalValue(SELLER_EMAIL)}</a>
        </li>
      </ul>
    ),
  },
];
