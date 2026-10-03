import assert from "node:assert/strict";
import { createPaymentForOrderWith } from "@/lib/payments/create";
import type { PaymentsDeps } from "@/lib/payments/deps";
import type { NotificationInput } from "@/lib/notifications/types";
import type { YookassaClient } from "@/lib/yookassa";
import type { FakeYookassa } from "./fake-yookassa";
import { MemoryPaymentsRepo, ORDER_ID, fakeClient, makeDeps, sampleItems, sampleOrder, type MemOrder } from "./memory-repo";

// Тестовый «мир» платёжного контура: управляемые часы, in-memory БД с заказом-образцом, клиент на fake-ЮKassa.

export const T0 = new Date("2026-10-01T12:30:00.000Z");

export interface World {
  clock: { now: Date };
  repo: MemoryPaymentsRepo;
  yk: YookassaClient;
  deps: PaymentsDeps;
  notes: NotificationInput[];
  templates(): string[];
  advance(ms: number): void;
  /** Создать платёж нашим кодом → id платежа в ЮKassa. */
  newPayment(): Promise<string>;
  /** Покупатель оплатил на стороне ЮKassa → объект, полученный НАШИМ GET. */
  payAndFetch(id: string, extra?: Record<string, unknown>): ReturnType<YookassaClient["getPayment"]>;
}

export function makeWorld(fake: FakeYookassa, orderOver: Partial<MemOrder> = {}): World {
  const clock = { now: T0 };
  const repo = new MemoryPaymentsRepo(() => clock.now);
  repo.addOrder(sampleOrder({ reserved_until: new Date(T0.getTime() + 3 * 3600_000).toISOString(), ...orderOver }, T0), sampleItems());
  const yk = fakeClient(fake);
  const { deps, notifications } = makeDeps(repo, yk);
  return {
    clock, repo, yk, deps, notes: notifications,
    templates: () => notifications.map((n) => n.template),
    advance: (ms) => { clock.now = new Date(clock.now.getTime() + ms); },
    async newPayment() {
      const res = await createPaymentForOrderWith(deps, ORDER_ID);
      assert.ok(res.ok);
      return res.paymentId;
    },
    async payAndFetch(id, extra = {}) {
      fake.succeed(id, "sbp", extra);
      return yk.getPayment(id);
    },
  };
}
