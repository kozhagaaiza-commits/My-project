const LINES = [
  "Москва — курьер, 1–2 дня",
  "Регионы — СДЭК, 2–5 рабочих дней",
  "Доставка бесплатная, груз застрахован",
  "Оплата картой или СБП, 100% предоплата",
];

export function DeliveryInfo() {
  return (
    <section aria-labelledby="delivery-title" className="flex flex-col gap-3">
      <h2 id="delivery-title" className="text-lg font-semibold">Доставка и оплата</h2>
      <ul className="flex flex-col gap-2 text-sm text-silver">
        {LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
