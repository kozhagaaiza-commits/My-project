const STEPS = ["Выберите авто", "Оплатите картой или СБП", "Получите за 1–5 дней"];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
      <h2 className="mb-6 text-xl font-semibold md:text-2xl">Как это работает</h2>
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 md:p-5">
            <span className="font-mono text-2xl text-silver tabular-nums">{i + 1}</span>
            <span className="font-medium">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
