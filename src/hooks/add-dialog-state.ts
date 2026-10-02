// Состояние диалогов «В корзину» (несовместимость → смена корзины) без React: тестируется node:test.
// Закрытие адресное: AlertDialogAction вызывает onClick, а затем onOpenChange(false) — второе событие
// не должно затирать диалог, который onClick только что открыл (misfit → confirm → mixed).
export type AddDialog = "misfit" | "mixed" | null;

export type AddDialogEvent = { type: "open"; which: "misfit" | "mixed" } | { type: "close"; which: "misfit" | "mixed" };

export function addDialogReducer(current: AddDialog, event: AddDialogEvent): AddDialog {
  if (event.type === "open") return event.which;
  return current === event.which ? null : current;
}
