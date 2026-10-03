import { ShieldCheck, Truck, Warehouse, type LucideIcon } from "lucide-react";

const ITEMS: Array<{ icon: LucideIcon; text: string }> = [
  { icon: Warehouse, text: "Склад в Москве" },
  { icon: Truck, text: "Доставка по России бесплатно, со страховкой" },
  { icon: ShieldCheck, text: "Гарантия до 24 месяцев" },
];

export function ValueStrip() {
  return (
    <section aria-label="Преимущества" className="border-b border-border">
      <ul className="mx-auto grid max-w-7xl gap-4 px-4 py-6 md:grid-cols-3 md:px-6">
        {ITEMS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-sm">
            <Icon className="size-6 shrink-0 text-silver" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
