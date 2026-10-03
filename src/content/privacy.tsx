import type { StaticSection } from "@/components/shop/static/StaticPage";
import { PRIVACY_POLICY_VERSION } from "@/lib/config";
import { legalValue, SELLER_EMAIL, SELLER_INN, SELLER_NAME } from "@/lib/legal";

export const privacyVersion = PRIVACY_POLICY_VERSION;

export const privacySections: StaticSection[] = [
  {
    id: "operator",
    title: "Оператор персональных данных",
    body: (
      <ul>
        <li>{legalValue(SELLER_NAME)}</li>
        <li>ИНН: {legalValue(SELLER_INN)}</li>
        <li>
          Email: <a href={`mailto:${SELLER_EMAIL}`}>{legalValue(SELLER_EMAIL)}</a>
        </li>
      </ul>
    ),
  },
  {
    id: "data",
    title: "Состав данных",
    body: <p>Имя, телефон, email, адрес доставки, VIN автомобиля. Паспортные данные и дата рождения не собираются.</p>,
  },
  {
    id: "purposes",
    title: "Цели обработки",
    body: (
      <ul>
        <li>исполнение заказа;</li>
        <li>доставка;</li>
        <li>связь с покупателем.</li>
      </ul>
    ),
  },
  {
    id: "storage",
    title: "Хранение",
    body: <p>Данные хранятся в базе данных Supabase.</p>,
  },
  {
    id: "transfer",
    title: "Передача третьим лицам",
    body: (
      <ul>
        <li>СДЭК — для доставки заказа;</li>
        <li>ЮKassa — для приёма оплаты.</li>
      </ul>
    ),
  },
  {
    id: "term",
    title: "Срок хранения",
    body: <p>3 года после исполнения заказа.</p>,
  },
  {
    id: "withdraw",
    title: "Отзыв согласия",
    body: (
      <p>
        Чтобы отозвать согласие или удалить данные, напишите оператору на{" "}
        <a href={`mailto:${SELLER_EMAIL}`}>{legalValue(SELLER_EMAIL)}</a>.
      </p>
    ),
  },
];
