import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { FakeTelegram, tgError } from "@/lib/notifications/__fixtures__/fake-telegram";
import { MemoryQueueRepo } from "@/lib/notifications/__fixtures__/memory-queue";
import { kickNotificationQueue, processNotificationQueue, type DispatchDeps } from "@/lib/notifications/dispatch";
import { notifyCustomerStatusChanged } from "@/lib/notifications/customer-status";
import { FakeYookassa } from "@/lib/payments/__fixtures__/fake-yookassa";
import {
  ADMIN_CHAT, MemoryPaymentsRepo, ORDER_ID, SITE, fakeClient, makeDeps, sampleItems, sampleOrder,
} from "@/lib/payments/__fixtures__/memory-repo";
import { createPaymentForOrderWith } from "@/lib/payments/create";
import type { PaymentsDeps } from "@/lib/payments/deps";
import { processPaymentObjectWith, processRefundObjectWith } from "@/lib/payments/process";
import { createMailer, type MailTransport } from "@/lib/mailer";
import { createTelegramClient } from "@/lib/telegram";

// Платёжный контур → notification_queue → отправка: fake-ЮKassa, fake-Telegram (node:http), in-memory очередь и репозиторий,
// почта — подмена транспорта. Проверяет US-003: после обработки webhook ОДНОГО вызова kick достаточно для отправки.

const TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw-x";
const CUSTOMER_CHAT = "512398764";
const T0 = new Date("2026-10-01T12:30:00.000Z");

let yk: FakeYookassa;
let tg: FakeTelegram;

before(async () => {
  yk = await new FakeYookassa().start();
  tg = await new FakeTelegram().start();
});
after(async () => { await yk.stop(); await tg.stop(); });
beforeEach(() => { yk.reset(); tg.reset(); });
afterEach(() => mock.restoreAll());

interface World {
  queue: MemoryQueueRepo;
  repo: MemoryPaymentsRepo;
  deps: PaymentsDeps;
  mails: Array<{ to: string; subject: string; text: string; html: string; from: string; replyTo: string }>;
  mailFail: { value: boolean };
  clock: { now: Date };
  kicks: { count: number };
  processed(): ReturnType<typeof processNotificationQueue>;
}

function world(opts: { chatId?: string | null } = {}): World {
  const clock = { now: T0 };
  const queue = new MemoryQueueRepo(() => clock.now);
  const repo = new MemoryPaymentsRepo(() => clock.now);
  repo.addOrder(sampleOrder({ reserved_until: new Date(T0.getTime() + 3 * 3600_000).toISOString() }, T0), sampleItems());
  const mails: World["mails"] = [];
  const mailFail = { value: false };
  const transport: MailTransport = {
    sendMail: async (o) => {
      if (mailFail.value) throw new Error("554 5.7.1 rejected");
      mails.push(o);
      return { messageId: "<m>" };
    },
  };
  const mailer = createMailer({ transport, from: "ForgeCarbon <orders@forgecarbon.ru>", replyTo: "orders@forgecarbon.ru", sleep: async () => {} });
  const telegram = createTelegramClient({ token: TOKEN, baseUrl: tg.url, sleep: async () => {} });
  const dispatch: DispatchDeps = {
    repo: queue,
    sendTelegram: (chatId, text) => telegram.sendMessage(chatId, text),
    sendEmail: (m) => mailer.sendMail(m),
  };
  const run = (limit: number) => processNotificationQueue({ limit, deps: dispatch, now: () => clock.now, dueSkewMs: 0 });
  const kicks = { count: 0 };
  const { deps } = makeDeps(repo, fakeClient(yk), {
    enqueue: queue.enqueue,
    customerChatId: async () => (opts.chatId === undefined ? null : opts.chatId),
    kick: async () => { kicks.count++; await kickNotificationQueue(10, run); },
    now: () => clock.now,
  });
  return { queue, repo, deps, mails, mailFail, clock, kicks, processed: () => run(50) };
}

async function pay(w: World): Promise<void> {
  const created = await createPaymentForOrderWith(w.deps, ORDER_ID);
  assert.ok(created.ok);
  yk.succeed(created.paymentId, "bank_card");
  await processPaymentObjectWith(w.deps, await fakeClient(yk).getPayment(created.paymentId));
}

describe("payments → очередь → отправка (US-003: письмо ≤ 1 мин)", () => {
  it("webhook payment.succeeded: одного kick хватает — админу Telegram, покупателю письмо; очередь пуста", async () => {
    const w = world();
    await pay(w);
    assert.equal(w.repo.orders.get(ORDER_ID)?.status, "paid");
    assert.equal(w.kicks.count, 1);

    assert.deepEqual(w.queue.rows.map((r) => `${r.template}:${r.channel}:${r.status}`), [
      "admin_order_paid:telegram:sent", "customer_order_paid:email:sent",
    ]);
    // Telegram админу
    assert.equal(tg.of("sendMessage").length, 1);
    const adminMsg = tg.of("sendMessage")[0];
    assert.equal(adminMsg.body.chat_id, ADMIN_CHAT);
    assert.match(String(adminMsg.body.text), /^💳 Оплачен заказ <b>FC-26-000123<\/b>/);
    assert.equal(adminMsg.body.parse_mode, "HTML");
    // письмо покупателю
    assert.equal(w.mails.length, 1);
    assert.equal(w.mails[0].to, "artem.sokolov@yandex.ru");
    assert.equal(w.mails[0].subject, "Заказ FC-26-000123 оплачен");
    assert.equal(w.mails[0].from, "ForgeCarbon <orders@forgecarbon.ru>");
    assert.equal(w.mails[0].replyTo, "orders@forgecarbon.ru");
    assert.match(w.mails[0].html, /Статус заказа/);
    assert.match(w.mails[0].text, /\/orders\/FC-26-000123\?t=tok_/);
    assert.equal(await w.queue.countPending(), 0);
  });

  it("покупатель подписан в боте: ещё и Telegram покупателю (customer_order_paid)", async () => {
    const w = world({ chatId: CUSTOMER_CHAT });
    await pay(w);
    assert.deepEqual(w.queue.rows.map((r) => `${r.template}:${r.channel}`), [
      "admin_order_paid:telegram", "customer_order_paid:email", "customer_order_paid:telegram",
    ]);
    assert.ok(w.queue.rows.every((r) => r.status === "sent"));
    const toCustomer = tg.of("sendMessage").filter((r) => r.body.chat_id === CUSTOMER_CHAT);
    assert.equal(toCustomer.length, 1);
    assert.match(String(toCustomer[0].body.text), /^Заказ FC-26-000123 оплачен/);
    assert.equal(w.mails.length, 1);
  });

  it("Telegram недоступен: письмо уходит, Telegram остаётся в очереди и доставляется позже (cron)", async () => {
    const w = world();
    tg.script(tgError(502, "Bad Gateway"), tgError(502, "Bad Gateway"), tgError(502, "Bad Gateway"));
    await pay(w);
    assert.equal(w.mails.length, 1); // письмо не зависит от Telegram
    const adminRow = w.queue.rows.find((r) => r.template === "admin_order_paid");
    assert.ok(adminRow);
    assert.equal(adminRow.status, "pending");
    assert.equal(adminRow.attempts, 1);
    assert.equal(adminRow.next_attempt_at.getTime(), T0.getTime() + 5 * 60_000);
    // «cron» через 5 минут
    w.clock.now = new Date(T0.getTime() + 5 * 60_000);
    const res = await w.processed();
    assert.equal(res.sent, 1);
    assert.equal(w.queue.get(adminRow.id).status, "sent");
  });

  it("SMTP отклонил письмо: оплата не страдает, письмо в очереди; повторная отправка после восстановления", async () => {
    const w = world();
    w.mailFail.value = true;
    await pay(w);
    assert.equal(w.repo.orders.get(ORDER_ID)?.status, "paid");
    const mailRow = w.queue.rows.find((r) => r.channel === "email");
    assert.ok(mailRow);
    assert.equal(mailRow.status, "pending");
    assert.match(mailRow.last_error ?? "", /554/);
    w.mailFail.value = false;
    w.clock.now = new Date(T0.getTime() + 5 * 60_000);
    assert.equal((await w.processed()).sent, 1);
    assert.equal(w.mails.length, 1);
  });

  it("повторный webhook (already_paid) не создаёт дублей уведомлений", async () => {
    const w = world();
    const created = await createPaymentForOrderWith(w.deps, ORDER_ID);
    assert.ok(created.ok);
    yk.succeed(created.paymentId, "bank_card");
    const payment = await fakeClient(yk).getPayment(created.paymentId);
    await processPaymentObjectWith(w.deps, payment);
    await processPaymentObjectWith(w.deps, payment);
    assert.equal(w.mails.length, 1);
    assert.equal(tg.of("sendMessage").length, 1);
  });

  it("refund.succeeded → customer_refund: письмо (+ Telegram при подписке)", async () => {
    const w = world({ chatId: CUSTOMER_CHAT });
    await pay(w);
    w.mails.length = 0;
    tg.reset();
    // возврат, созданный нашим кодом: строка refunds pending → webhook refund.succeeded
    const payment = w.repo.payments[0];
    const row = await w.repo.insertRefund({ order_id: ORDER_ID, payment_id: payment.id, amount: 13370000, reason: "Клиент передумал", restock: false });
    assert.ok("row" in row && row.row);
    await w.repo.updateRefund(row.row.id, { yookassa_refund_id: "2ec4b1f0-0015-5000-8000-1d7e2a9c4b36", status: "pending" });
    const res = await processRefundObjectWith(w.deps, {
      id: "2ec4b1f0-0015-5000-8000-1d7e2a9c4b36", payment_id: payment.yookassa_payment_id, status: "succeeded",
      amount: { value: "133700.00", currency: "RUB" }, created_at: T0.toISOString(),
    });
    assert.equal(res.kind, "refund_succeeded");
    assert.equal(w.mails.length, 1);
    assert.match(w.mails[0].subject, /^Возврат по заказу FC-26-000123/);
    assert.match(w.mails[0].text, /Срок зачисления зависит от банка, обычно до 10 рабочих дней/);
    assert.equal(tg.of("sendMessage").filter((r) => r.body.chat_id === CUSTOMER_CHAT).length, 1);
  });
});

describe("уведомление не роняет основной запрос", () => {
  it("enqueue бросает и kick бросает — notify возвращает false, обработка платежа завершается", async () => {
    mock.method(console, "error", () => {});
    const w = world();
    const deps: PaymentsDeps = {
      ...w.deps,
      enqueue: async () => { throw new Error("db down"); },
      kick: async () => { throw new Error("kick down"); },
    };
    const created = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.ok(created.ok);
    yk.succeed(created.paymentId, "sbp");
    const result = await processPaymentObjectWith(deps, await fakeClient(yk).getPayment(created.paymentId));
    assert.equal(result.kind, "paid");
    assert.equal(w.repo.orders.get(ORDER_ID)?.status, "paid");
  });

  it("если ничего не поставлено в очередь, kick не вызывается", async () => {
    mock.method(console, "error", () => {});
    const w = world();
    const deps: PaymentsDeps = { ...w.deps, enqueue: async () => false };
    const created = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.ok(created.ok);
    yk.succeed(created.paymentId, "sbp");
    await processPaymentObjectWith(deps, await fakeClient(yk).getPayment(created.paymentId));
    assert.equal(w.kicks.count, 0);
  });

  it("ошибка чтения telegram_chat_id — письмо всё равно ставится", async () => {
    mock.method(console, "error", () => {});
    const w = world();
    const deps: PaymentsDeps = { ...w.deps, customerChatId: async () => { throw new Error("db"); } };
    const created = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.ok(created.ok);
    yk.succeed(created.paymentId, "sbp");
    await processPaymentObjectWith(deps, await fakeClient(yk).getPayment(created.paymentId));
    assert.equal(w.mails.length, 1);
  });
});

describe("notifyCustomerStatusChanged (для админки, День 6)", () => {
  it("shipped с треком: письмо + Telegram подписчику; ссылка СДЭК только для shipped", async () => {
    const w = world();
    const ok = await notifyCustomerStatusChanged(
      { enqueue: w.queue.enqueue, customerChatId: async () => CUSTOMER_CHAT, kick: w.deps.kick },
      { orderNumber: "FC-26-000123", customerEmail: "artem.sokolov@yandex.ru", status: "shipped", trackingNumber: "1234567890", orderUrl: `${SITE}/orders/FC-26-000123?t=x` },
    );
    assert.equal(ok, true);
    assert.equal(w.mails.length, 1);
    assert.equal(w.mails[0].subject, "Заказ FC-26-000123: Передан в доставку");
    assert.match(w.mails[0].text, /Трек СДЭК: 1234567890/);
    assert.match(String(tg.of("sendMessage")[0].body.text), /^Заказ FC-26-000123: Передан в доставку\. Трек СДЭК: 1234567890\nОтследить: https:\/\/www\.cdek\.ru\/ru\/tracking\?order_id=1234567890$/);

    tg.reset();
    w.mails.length = 0;
    await notifyCustomerStatusChanged(
      { enqueue: w.queue.enqueue, customerChatId: async () => null, kick: w.deps.kick },
      { orderNumber: "FC-26-000123", customerEmail: "artem.sokolov@yandex.ru", status: "confirmed", trackingNumber: "1234567890", orderUrl: null },
    );
    assert.equal(w.mails.length, 1);
    assert.doesNotMatch(w.mails[0].text, /Трек/);
    assert.equal(tg.of("sendMessage").length, 0);
  });
});
