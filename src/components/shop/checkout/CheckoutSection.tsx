import type { ReactNode } from "react";

interface CheckoutSectionProps {
  title: string;
  children: ReactNode;
}

export function CheckoutSection({ title, children }: CheckoutSectionProps) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`checkout-${title}`}>
      <h2 id={`checkout-${title}`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
