"use client";

import { useSyncExternalStore } from "react";

// Состояние открытия CartSheet: кнопка в шапке и AddToCart на странице товара управляют одним Sheet.
let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function setCartSheetOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useCartSheetOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}
