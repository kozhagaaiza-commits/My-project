import Link from "next/link";
import type { StaticSection } from "@/components/shop/static/StaticPage";

export const warrantySections = (telegramUrl: string, email: string): StaticSection[] => [
  {
    id: "term",
    title: "Срок гарантии",
    body: <p>Срок гарантии указан в карточке товара.</p>,
  },
  {
    id: "claim",
    title: "Как обратиться",
    body: (
      <>
        <p>
          Напишите нам в <a href={telegramUrl}>Telegram</a> или на <a href={`mailto:${email}`}>{email}</a>. Приложите:
        </p>
        <ul>
          <li>номер заказа;</li>
          <li>фото товара и дефекта.</li>
        </ul>
      </>
    ),
  },
  {
    id: "return",
    title: "Возврат",
    body: (
      <>
        <p>
          Возврат товара надлежащего качества — 7 дней с момента получения, если сохранены товарный вид и упаковка.
        </p>
        <p>
          Деньги возвращаются тем же способом в течение 10 дней с даты получения возвращённого товара.
        </p>
        <p>На установленные диски со следами монтажа возврат не распространяется.</p>
      </>
    ),
  },
  {
    id: "see-also",
    title: "См. также",
    body: (
      <p>
        <Link href="/delivery">Доставка и оплата</Link>, <Link href="/offer">Публичная оферта</Link>.
      </p>
    ),
  },
];
