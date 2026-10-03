import type { ReactNode } from "react";

interface ProductFormSectionProps {
  title: string;
  children: ReactNode;
  /** id секции (якорь для тестов и aria). */
  id: string;
}

/** Блок формы с заголовком («Основное», «Цена»…). */
export function ProductFormSection({ title, children, id }: ProductFormSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground md:p-6">
      <h2 id={`${id}-title`} className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
