import { Check } from "lucide-react";

const TERMS = [
  "Отдельные цены после проверки",
  "Склад в Москве — без ожидания",
  "Заказы ваших клиентов в одном кабинете",
] as const;

/** Условия для ателье (Блок 4): заголовок и 3 пункта. */
export function AtelierTerms() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Для тюнинг-ателье</h1>
      <ul className="flex flex-col gap-3">
        {TERMS.map((term) => (
          <li key={term} className="flex items-start gap-3 text-base">
            <Check className="mt-0.5 size-5 shrink-0 text-silver" aria-hidden />
            <span>{term}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
