// Чистая логика корзины (localStorage.fc_cart_v1). Без React и без обращения к window — тестируется node:test.
// Деньги — целые копейки. Edge Case 17: повреждённые данные считаются пустой корзиной.
import { MAX_CARBON_QTY_PER_LINE, MAX_LINES_PER_ORDER, MAX_WHEEL_SETS_PER_LINE } from "@/lib/config";
import type { CartKind, CartValidateItem, CartValidation, StoredCart } from "@/types/cart";
import type { ProductType } from "@/types/catalog";

export const CART_STORAGE_KEY = "fc_cart_v1";

/** Позиция корзины: обязательные поля контракта StoredCart + необязательные подсказки для UI (title/slug/type). */
export interface CartItem {
  product_id: string;
  quantity: number;
  price_seen: number;
  title?: string;
  slug?: string;
  specs_short?: string | null;
  type?: ProductType;
}

export interface Cart {
  kind: CartKind;
  items: CartItem[];
  updated_at: string;
}

export const EMPTY_CART: Cart = Object.freeze({ kind: "stock", items: [], updated_at: "" }) as Cart;

export const emptyCart = (now: Date = new Date()): Cart => ({ kind: "stock", items: [], updated_at: now.toISOString() });

/** Лимит количества одной позиции (BR-04). Без известного типа — общий потолок схемы (4), точнее ограничит сервер. */
export function maxQuantityFor(type: ProductType | undefined): number {
  return type === "wheel_set" ? MAX_WHEEL_SETS_PER_LINE : MAX_CARBON_QTY_PER_LINE;
}

export const cartCount = (cart: Cart): number => cart.items.reduce((sum, i) => sum + i.quantity, 0);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPositiveInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

function parseItem(raw: unknown): CartItem | null {
  if (!isRecord(raw)) return null;
  const { product_id, quantity, price_seen, title, slug, specs_short, type } = raw;
  if (typeof product_id !== "string" || product_id.length === 0 || product_id.length > 64) return null;
  if (!isPositiveInt(quantity)) return null;
  if (typeof price_seen !== "number" || !Number.isSafeInteger(price_seen) || price_seen < 0) return null;
  const itemType: ProductType | undefined = type === "wheel_set" || type === "carbon_part" ? type : undefined;
  const item: CartItem = {
    product_id,
    quantity: Math.min(quantity, maxQuantityFor(itemType)),
    price_seen,
  };
  if (typeof title === "string" && title) item.title = title.slice(0, 200);
  if (typeof slug === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 120) item.slug = slug;
  if (typeof specs_short === "string" && specs_short) item.specs_short = specs_short.slice(0, 200);
  if (itemType) item.type = itemType;
  return item;
}

export interface ParsedCart {
  cart: Cart;
  /** Что-то отброшено или JSON не разобрался — хранилище стоит перезаписать очищенной корзиной. */
  dirty: boolean;
}

/** Разбор содержимого localStorage. null/пусто → пустая корзина без перезаписи; мусор → пустая/очищенная + dirty. */
export function parseStoredCart(raw: string | null): ParsedCart {
  if (raw === null) return { cart: EMPTY_CART, dirty: false };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { cart: EMPTY_CART, dirty: true };
  }
  if (!isRecord(value) || !Array.isArray(value.items)) return { cart: EMPTY_CART, dirty: true };

  const seen = new Set<string>();
  const items: CartItem[] = [];
  let dirty = false;
  for (const entry of value.items) {
    const item = parseItem(entry);
    if (!item || seen.has(item.product_id) || items.length >= MAX_LINES_PER_ORDER) {
      dirty = true;
      continue;
    }
    seen.add(item.product_id);
    items.push(item);
  }
  // kind корзины — kind первого товара; поле из хранилища учитываем, только если оно валидно.
  const kind: CartKind = value.kind === "preorder" ? "preorder" : "stock";
  if (value.kind !== "stock" && value.kind !== "preorder") dirty = true;
  const updated_at = typeof value.updated_at === "string" ? value.updated_at : "";
  if (items.length === 0 && !dirty) return { cart: EMPTY_CART, dirty: false };
  return { cart: { kind, items, updated_at }, dirty };
}

export const serializeCart = (cart: Cart): string => {
  const stored: StoredCart & { items: CartItem[] } = { kind: cart.kind, items: cart.items, updated_at: cart.updated_at };
  return JSON.stringify(stored);
};

export type AddStatus =
  | "added" // позиция добавлена/увеличена целиком
  | "limited" // количество упёрлось в лимит позиции (BR-04), корзина изменена (или осталась на максимуме)
  | "mixed_kind" // корзина другого kind (BR-03) — решает пользователь
  | "too_many_lines"; // уже MAX_LINES_PER_ORDER позиций

export interface AddResult {
  status: AddStatus;
  cart: Cart;
  /** Итоговое количество этой позиции в корзине после добавления. */
  quantity: number;
  /** Максимум для позиции (для текста toast). */
  max: number;
  /** Количество фактически не изменилось (уже стояло на максимуме). */
  unchanged: boolean;
}

export interface AddInput {
  item: CartItem;
  kind: CartKind;
}

/** Добавление позиции (без записи): повторное добавление суммирует количество, но не выше лимита. */
export function addItem(cart: Cart, { item, kind }: AddInput, now: Date = new Date()): AddResult {
  const max = maxQuantityFor(item.type);
  const existing = cart.items.find((i) => i.product_id === item.product_id);
  const base = { max, unchanged: false };

  if (cart.items.length > 0 && cart.kind !== kind) {
    return { ...base, status: "mixed_kind", cart, quantity: existing?.quantity ?? 0, unchanged: true };
  }
  if (!existing && cart.items.length >= MAX_LINES_PER_ORDER) {
    return { ...base, status: "too_many_lines", cart, quantity: 0, unchanged: true };
  }

  const wanted = (existing?.quantity ?? 0) + Math.max(1, Math.trunc(item.quantity));
  const quantity = Math.min(wanted, max);
  const merged: CartItem = { ...existing, ...item, quantity };
  const items = existing
    ? cart.items.map((i) => (i.product_id === item.product_id ? merged : i))
    : [...cart.items, merged];
  return {
    status: wanted > max ? "limited" : "added",
    cart: { kind: cart.items.length === 0 ? kind : cart.kind, items, updated_at: now.toISOString() },
    quantity,
    max,
    unchanged: existing !== undefined && existing.quantity === quantity,
  };
}

/** Новая корзина из одной позиции — «Заменить корзину». */
export const replaceWith = (kind: CartKind, items: CartItem[], now: Date = new Date()): Cart => ({
  kind,
  items: items.slice(0, MAX_LINES_PER_ORDER),
  updated_at: now.toISOString(),
});

/** Количество позиции: 1…лимит. Неизвестный id → корзина без изменений. */
export function setQuantity(cart: Cart, productId: string, quantity: number, now: Date = new Date()): Cart {
  const target = cart.items.find((i) => i.product_id === productId);
  if (!target || !Number.isFinite(quantity)) return cart;
  const next = Math.min(Math.max(1, Math.trunc(quantity)), maxQuantityFor(target.type));
  if (next === target.quantity) return cart;
  return {
    ...cart,
    items: cart.items.map((i) => (i.product_id === productId ? { ...i, quantity: next } : i)),
    updated_at: now.toISOString(),
  };
}

export interface RemovedItem {
  kind: CartKind;
  item: CartItem;
  index: number;
}

export interface RemoveResult {
  cart: Cart;
  removed: RemovedItem | null;
}

export function removeItem(cart: Cart, productId: string, now: Date = new Date()): RemoveResult {
  const index = cart.items.findIndex((i) => i.product_id === productId);
  if (index === -1) return { cart, removed: null };
  const items = cart.items.filter((_, i) => i !== index);
  return {
    cart: { kind: cart.kind, items, updated_at: now.toISOString() },
    removed: { kind: cart.kind, item: cart.items[index], index },
  };
}

/** «Вернуть»: позиция встаёт на прежнее место. Если корзина за это время стала другого kind или полна — без изменений. */
export function restoreItem(cart: Cart, removed: RemovedItem, now: Date = new Date()): Cart {
  if (cart.items.some((i) => i.product_id === removed.item.product_id)) return cart;
  if (cart.items.length > 0 && cart.kind !== removed.kind) return cart;
  if (cart.items.length >= MAX_LINES_PER_ORDER) return cart;
  const items = [...cart.items];
  items.splice(Math.min(removed.index, items.length), 0, removed.item);
  return { kind: cart.items.length === 0 ? removed.kind : cart.kind, items, updated_at: now.toISOString() };
}

export interface ReducedLine {
  product_id: string;
  quantity: number;
  type: ProductType | undefined;
}

export interface Reconciled {
  cart: Cart;
  changed: boolean;
  /** Позиции, у которых сервер уменьшил количество (problem = "qty_reduced"). */
  reduced: ReducedLine[];
}

const usable = (l: CartValidateItem) => l.problem === null || l.problem === "qty_reduced";

/**
 * Сверка корзины с ответом validate: количество — по ответу (но не выше max_quantity),
 * title/slug обновляются, если сервер их прислал (у unavailable они пустые — остаются локальные).
 * price_seen НЕ трогаем: это цена, которую видел покупатель, с ней сравнивается актуальная.
 */
export function reconcileCart(cart: Cart, validation: CartValidation, now: Date = new Date()): Reconciled {
  const byId = new Map(validation.items.map((l) => [l.product_id, l]));
  const reduced: ReducedLine[] = [];
  let changed = false;
  const items = cart.items.map((item) => {
    const line = byId.get(item.product_id);
    if (!line) return item;
    let next = item;
    if (usable(line) && line.quantity >= 1) {
      const quantity = Math.min(line.quantity, line.max_quantity >= 1 ? line.max_quantity : line.quantity);
      if (quantity !== item.quantity) {
        next = { ...next, quantity };
        if (quantity < item.quantity || line.problem === "qty_reduced") {
          reduced.push({ product_id: item.product_id, quantity, type: item.type });
        }
      }
    }
    if (line.title && line.slug && (line.title !== item.title || line.slug !== item.slug)) {
      next = { ...next, title: line.title, slug: line.slug };
    }
    if (next !== item) changed = true;
    return next;
  });
  return { cart: changed ? { ...cart, items, updated_at: now.toISOString() } : cart, changed, reduced };
}

/** Покупатель перешёл к оформлению: актуальные цены считаются увиденными (убирает «Цена изменилась»). */
export function acknowledgePrices(cart: Cart, validation: CartValidation, now: Date = new Date()): Cart {
  const prices = new Map(validation.items.filter(usable).map((l) => [l.product_id, l.unit_price]));
  let changed = false;
  const items = cart.items.map((i) => {
    const price = prices.get(i.product_id);
    if (price === undefined || price === i.price_seen) return i;
    changed = true;
    return { ...i, price_seen: price };
  });
  return changed ? { ...cart, items, updated_at: now.toISOString() } : cart;
}

/** Ключ запроса validate: только то, что уходит на сервер (id + количество). */
export const validationKey = (cart: Cart): string => cart.items.map((i) => `${i.product_id}:${i.quantity}`).join(",");

/** Склонение: 1 комплект / 2 комплекта / 5 комплектов. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

/** «Доступно только 1 комплект, количество уменьшено» (для карбона — «штука»). */
export function qtyReducedMessage(quantity: number, type: ProductType | undefined): string {
  const unit = type === "carbon_part"
    ? plural(quantity, ["штука", "штуки", "штук"])
    : plural(quantity, ["комплект", "комплекта", "комплектов"]);
  return `Доступно только ${quantity} ${unit}, количество уменьшено`;
}

/** «Максимум 2 комплекта одного диска в заказе» / «Максимум 4 штуки одной детали в заказе». */
export function maxQuantityMessage(max: number, type: ProductType | undefined): string {
  return type === "wheel_set"
    ? `Максимум ${max} ${plural(max, ["комплект", "комплекта", "комплектов"])} одного диска в заказе`
    : `Максимум ${max} ${plural(max, ["штука", "штуки", "штук"])} одной детали в заказе`;
}
