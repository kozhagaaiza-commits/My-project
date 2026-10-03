"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  CART_STORAGE_KEY, EMPTY_CART, cartCount, parseStoredCart, removeItem, restoreItem, serializeCart, setQuantity,
  type Cart, type RemovedItem,
} from "@/lib/cart-store";

// localStorage.fc_cart_v1 как внешний store: синхронизация между вкладками (событие storage)
// и между компонентами вкладки (fc:cart-change). Все обращения к localStorage — в try/catch (Edge Case 17):
// недоступен/не пишется → корзина живёт в памяти вкладки + один раз toast.
const CHANGE_EVENT = "fc:cart-change";
const MEMORY_WARNING = "Корзина не сохранится после закрытия вкладки";

let memoryOnly = false;
let memoryCart: Cart = EMPTY_CART;
let warned = false;
let cache: { raw: string | null; cart: Cart } | null = null;

function getSnapshot(): Cart {
  if (memoryOnly) return memoryCart;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    memoryOnly = true; // localStorage недоступен (приватный режим, запрет)
    return memoryCart;
  }
  if (cache && cache.raw === raw) return cache.cart;
  const { cart } = parseStoredCart(raw);
  cache = { raw, cart };
  return cart;
}

const getServerSnapshot = (): Cart => EMPTY_CART;

/** Повреждённое содержимое перезаписывается очищенной корзиной (Edge Case 17). */
function heal(): void {
  if (memoryOnly) return;
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    const { cart, dirty } = parseStoredCart(raw);
    if (!dirty) return;
    if (cart.items.length === 0) window.localStorage.removeItem(CART_STORAGE_KEY);
    else window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(cart));
    cache = null;
  } catch {
    memoryOnly = true;
  }
}

function subscribe(onChange: () => void): () => void {
  heal();
  const onStorage = (e: StorageEvent) => {
    if (e.key === CART_STORAGE_KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Текущая корзина (только в обработчиках событий и эффектах — на клиенте). */
export const readCart = (): Cart => getSnapshot();

export function writeCart(next: Cart): void {
  memoryCart = next;
  if (!memoryOnly) {
    try {
      if (next.items.length === 0) {
        window.localStorage.removeItem(CART_STORAGE_KEY);
        cache = { raw: null, cart: EMPTY_CART };
      } else {
        const raw = serializeCart(next);
        window.localStorage.setItem(CART_STORAGE_KEY, raw);
        cache = { raw, cart: next };
      }
    } catch {
      memoryOnly = true;
    }
  }
  if (memoryOnly && !warned) {
    warned = true;
    toast.warning(MEMORY_WARNING, { id: "cart-memory-only" });
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export const clearCart = (): void => writeCart(EMPTY_CART);

export function setCartQuantity(productId: string, quantity: number): void {
  const current = getSnapshot();
  const next = setQuantity(current, productId, quantity);
  if (next !== current) writeCart(next);
}

export function removeCartItem(productId: string): RemovedItem | null {
  const { cart, removed } = removeItem(getSnapshot(), productId);
  if (removed) writeCart(cart);
  return removed;
}

export function restoreCartItem(removed: RemovedItem): void {
  const current = getSnapshot();
  const next = restoreItem(current, removed);
  if (next !== current) writeCart(next);
}

const subscribeNoop = () => () => {};

/** false на сервере и в первом клиентском рендере: до гидратации корзину «пустой» показывать нельзя. */
export function useCartReady(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export function useCart(): { cart: Cart; ready: boolean; count: number } {
  const cart = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useCartReady();
  return { cart, ready, count: cartCount(cart) };
}
