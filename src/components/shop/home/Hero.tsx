import { VehicleSelector } from "@/components/shop/VehicleSelector";

// Фото /public/hero.webp пока нет: фон — графитовый паттерн с затемнением bg-black/60.
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="absolute inset-0 bg-[repeating-linear-gradient(45deg,var(--card)_0_6px,var(--background)_6px_12px)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(60%_90%_at_75%_10%,var(--border),transparent_70%)] opacity-70"
      />
      <div aria-hidden className="absolute inset-0 bg-black/60" />
      <div className="relative mx-auto flex max-w-7xl flex-col justify-center gap-8 px-4 py-12 md:px-6 md:py-16 lg:min-h-[70vh]">
        <div className="flex max-w-3xl flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            Диски и карбон для Audi, BMW, Mercedes-Benz
          </h1>
          <p className="text-lg text-silver">Склад в Москве. Доставка до 5 дней</p>
        </div>
        <div className="rounded-xl border border-border bg-card/80 p-4 backdrop-blur md:p-6">
          <VehicleSelector mode="hero" idPrefix="hero" />
        </div>
      </div>
    </section>
  );
}
