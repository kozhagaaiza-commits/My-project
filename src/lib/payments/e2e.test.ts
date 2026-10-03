import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createYookassaWebhookHandler } from "@/app/api/webhooks/yookassa/handler";
import { FakeYookassa } from "@/lib/payments/__fixtures__/fake-yookassa";
import { MemoryPaymentsRepo, ORDER_ID, SITE, fakeClient, makeDeps, sampleItems, sampleOrder } from "@/lib/payments/__fixtures__/memory-repo";
import { createPaymentForOrderWith } from "@/lib/payments/create";
import { processPaymentObjectWith, processRefundObjectWith } from "@/lib/payments/process";
import { reconcileOrderPaymentsWith } from "@/lib/payments/reconcile";

// Сквозной сценарий US-003 на fake-ЮKassa и in-memory БД: заказ → платёж → оплата на стороне ЮKassa → webhook → paid.
// Ссылка возврата строится настоящими orderToken / orderPageUrl (A28): token.ts читает env при импорте — задаём его заранее.

const SECRET = "o".repeat(32);
let token: typeof import("@/lib/orders/token");
let fake: FakeYookassa;

before(async () => {
  const env = process.env as Record<string, string | undefined>;
  const vars: Record<string, string> = {
    NEXT_PUBLIC_SITE_URL: SITE, NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40), YOOKASSA_SHOP_ID: "123456",
    YOOKASSA_SECRET_KEY: "test_secret_key", TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(35)}`, TELEGRAM_BOT_USERNAME: "forgecarbon_bot",
    TELEGRAM_WEBHOOK_SECRET: "w".repeat(32), TELEGRAM_ADMIN_CHAT_ID: "-100123", SMTP_HOST: "smtp.yandex.ru", SMTP_PORT: "465",
    SMTP_USER: "orders@forgecarbon.ru", SMTP_PASSWORD: "password1", CRON_SECRET: "c".repeat(32), ORDER_TOKEN_SECRET: SECRET,
  };
  for (const [k, v] of Object.entries(vars)) env[k] ??= v;
  token = await import("@/lib/orders/token");
  fake = await new FakeYookassa().start();
});
after(async () => { await fake.stop(); });

function world() {
  fake.reset();
  const repo = new MemoryPaymentsRepo();
  const order = sampleOrder();
  repo.addOrder(order, sampleItems());
  const yk = fakeClient(fake);
  const { deps, notifications } = makeDeps(repo, yk, {
    orderUrl: (n, crid) => token.orderPageUrl(n, token.orderToken(crid, SECRET), SITE),
  });
  const POST = createYookassaWebhookHandler({
    getPayment: (id) => yk.getPayment(id), getRefund: (id) => yk.getRefund(id),
    processPayment: (p) => processPaymentObjectWith(deps, p), processRefund: (r) => processRefundObjectWith(deps, r),
  });
  const notify = (event: string, id: string) => POST(new Request(`${SITE}/api/webhooks/yookassa`, {
    method: "POST", headers: { "x-forwarded-for": "185.71.77.12", "content-type": "application/json" },
    body: JSON.stringify({ type: "notification", event, object: { id, status: "succeeded" } }),
  }));
  return { repo, order, deps, notifications, notify };
}

describe("сквозной сценарий: заказ → платёж → webhook → paid", () => {
  it("return_url с настоящим токеном не меняет статус; webhook переводит в paid и ставит уведомления", async () => {
    const { repo, order, deps, notifications, notify } = world();
    const pay = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.ok(pay.ok);

    const t = token.orderToken(order.client_request_id, SECRET);
    assert.match(t, /^[A-Za-z0-9_-]{32}$/);
    const returnUrl = (fake.requests[0].body as { confirmation: { return_url: string } }).confirmation.return_url;
    assert.equal(returnUrl, `${SITE}/orders/FC-26-000123?t=${t}&from=payment`);

    // Покупатель вернулся на return_url, но не оплатил: статус не меняется (BR-12).
    assert.equal(repo.orders.get(ORDER_ID)?.status, "pending_payment");

    // Оплата на стороне ЮKassa → уведомление (дважды: ЮKassa повторяет).
    fake.succeed(pay.paymentId, "bank_card");
    assert.equal((await notify("payment.succeeded", pay.paymentId)).status, 200);
    assert.equal((await notify("payment.succeeded", pay.paymentId)).status, 200);

    assert.equal(repo.orders.get(ORDER_ID)?.status, "paid");
    assert.equal(repo.paymentRaw(pay.paymentId)?.payment_method_type, "bank_card");
    assert.deepEqual(notifications.map((n) => `${n.template}:${n.channel}`), ["admin_order_paid:telegram", "customer_order_paid:email"]);
    const customer = notifications[1];
    assert.ok(customer.template === "customer_order_paid");
    assert.equal(customer.payload.order_url, `${SITE}/orders/FC-26-000123?t=${t}`);
    assert.ok(token.tokenMatchesHash(t, token.hashOrderToken(t)));
  });

  it("webhook потерян → сверка при открытии заказа даёт тот же результат", async () => {
    const { repo, deps, notifications } = world();
    const pay = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.ok(pay.ok);
    fake.succeed(pay.paymentId);
    const later = { ...deps, now: () => new Date(Date.now() + 61_000) };
    const sum = await reconcileOrderPaymentsWith(later, ORDER_ID);
    assert.equal(sum.paid, 1);
    assert.equal(repo.orders.get(ORDER_ID)?.status, "paid");
    assert.deepEqual(notifications.map((n) => n.template), ["admin_order_paid", "customer_order_paid"]);
  });

  it("две вкладки оплачены → второй платёж возвращён автоматически, первый остаётся", async () => {
    const { repo, deps, notifications, notify } = world();
    const a = await createPaymentForOrderWith(deps, ORDER_ID);
    const b = await createPaymentForOrderWith(deps, ORDER_ID);
    assert.ok(a.ok && b.ok);
    fake.succeed(a.paymentId, "sbp", { captured_at: "2026-10-01T12:34:00.000Z" });
    fake.succeed(b.paymentId, "bank_card", { captured_at: "2026-10-01T12:35:00.000Z" });
    await notify("payment.succeeded", a.paymentId);
    await notify("payment.succeeded", b.paymentId);
    await notify("payment.succeeded", a.paymentId); // повторная доставка первого
    assert.equal(fake.refunds.size, 1);
    assert.equal([...fake.refunds.values()][0].payment_id, b.paymentId);
    assert.equal(repo.orders.get(ORDER_ID)?.needs_attention, true);
    assert.deepEqual(notifications.map((n) => n.template), ["admin_order_paid", "customer_order_paid", "admin_attention", "customer_refund"]);

    // refund.succeeded от ЮKassa для уже succeeded возврата — ничего не меняет.
    const rid = String([...fake.refunds.values()][0].id);
    assert.equal((await notify("refund.succeeded", rid)).status, 200);
    assert.equal(notifications.length, 4);
  });
});
