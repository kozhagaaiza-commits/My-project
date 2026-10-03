import type { ReactNode } from "react";

/** Ошибка формы inline над кнопкой (Блок 4: тексты Error). */
export function AuthFormError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-foreground">
      {children}
    </div>
  );
}
