import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { MailResult } from "@/lib/mailer";
import { MemoryQueueRepo } from "@/lib/notifications/__fixtures__/memory-queue";
import {
  DEFAULT_DUE_SKEW_MS, LEASE_MS, RETRY_DELAYS_MS, kickNotificationQueue, processNotificationQueue, type DispatchDeps,
} from "@/lib/notifications/dispatch";
import type { NotificationInput } from "@/lib/notifications/types";
import type { TelegramResult } from "@/lib/telegram";

const T0 = new Date("2026-10-01T12:30:00.000Z");
const MIN = 60_000;

const EMAIL: NotificationInput = {
  channel: "email", recipient: "artem.sokolov@yandex.ru", template: "customer_refund",
  payload: { order_number: "FC-26-000123", amount: 13370000, amount_formatted: "133 700 ₽", order_url: "https://forgecarbon.vercel.app/orders/FC-26-000123?t=abc" },
};
const TG: NotificationInput = {
  channel: "telegram", recipient: "512398764", template: "admin_atelier_applied",
  payload: { company_name: "Garage 77", inn: "7801234567", city: "Санкт-Петербург" },
};

interface Harness {
  repo: MemoryQueueRepo;
  deps: DispatchDeps;
  emails: Array<{ to: string; subject: string }>;
  telegrams: Array<{ chatId: string; text: string }>;
  mode: { email: MailResult | "throw" | (() => Promise<MailResult>); telegram: TelegramResult<unknown> | "throw" };
  clock: { now: Date };
  run(limit?: number): ReturnType<typeof processNotificationQueue>;
}

function harness(): Harness {
  const clock = { now: T0 };
  const repo = new MemoryQueueRepo(() => clock.now);
  const emails: Harness["emails"] = [];
  const telegrams: Harness["telegrams"] = [];
  const mode: Harness["mode"] = { email: { kind: "ok", messageId: "m" }, telegram: { kind: "ok", result: { message_id: 1 } } };
  const deps: DispatchDeps = {
    repo,
    sendTelegram: async (chatId, text) => {
      telegrams.push({ chatId, text });
      if (mode.telegram === "throw") throw new Error("boom");
      return mode.telegram;
    },
    sendEmail: async (m) => {
      emails.push({ to: m.to, subject: m.subject });
      if (mode.email === "throw") throw new Error("smtp boom");
      return typeof mode.email === "function" ? mode.email() : mode.email;
    },
  };
  return {
    repo, deps, emails, telegrams, mode, clock,
    run: (limit = 50) => processNotificationQueue({ limit, deps, now: () => clock.now, dueSkewMs: 0 }),
  };
}

afterEach(() => mock.restoreAll());

describe("processNotificationQueue: отправка", () => {
  it("email и Telegram уходят, строки sent, счётчики", async () => {
    const h = harness();
    const e = h.repo.add(EMAIL);
    const t = h.repo.add(TG);
    const res = await h.run();
    assert.deepEqual(res, { sent: 2, failed: 0, retried: 0, remaining: 0 });
    assert.equal(h.repo.get(e.id).status, "sent");
    assert.equal(h.repo.get(e.id).attempts, 1);
    assert.equal(h.repo.get(t.id).status, "sent");
    assert.deepEqual(h.emails, [{ to: "artem.sokolov@yandex.ru", subject: "Возврат по заказу FC-26-000123" }]);
    assert.equal(h.telegrams[0].chatId, "512398764");
    assert.match(h.telegrams[0].text, /^🏁 Новая заявка ателье: Garage 77/);
  });

  it("отправленные и failed строки не берутся повторно", async () => {
    const h = harness();
    h.repo.add(EMAIL, { status: "sent" });
    h.repo.add(EMAIL, { status: "failed" });
    assert.deepEqual(await h.run(), { sent: 0, failed: 0, retried: 0, remaining: 0 });
    assert.equal(h.emails.length, 0);
  });

  it("строка с будущим next_attempt_at не due; due — после наступления срока", async () => {
    const h = harness();
    h.repo.add(EMAIL, { next_attempt_at: new Date(T0.getTime() + 5 * MIN) });
    assert.deepEqual(await h.run(), { sent: 0, failed: 0, retried: 0, remaining: 1 });
    h.clock.now = new Date(T0.getTime() + 5 * MIN);
    assert.equal((await h.run()).sent, 1);
  });

  it("limit и remaining; порядок по next_attempt_at", async () => {
    const h = harness();
    h.repo.add({ ...EMAIL, recipient: "c@x.test" }, { next_attempt_at: new Date(T0.getTime() - 1 * MIN) });
    h.repo.add({ ...EMAIL, recipient: "a@x.test" }, { next_attempt_at: new Date(T0.getTime() - 3 * MIN) });
    h.repo.add({ ...EMAIL, recipient: "b@x.test" }, { next_attempt_at: new Date(T0.getTime() - 2 * MIN) });
    const res = await h.run(2);
    assert.deepEqual(res, { sent: 2, failed: 0, retried: 0, remaining: 1 });
    assert.deepEqual(h.emails.map((m) => m.to), ["a@x.test", "b@x.test"]);
  });

  it("dueSkewMs: строка с next_attempt_at чуть впереди часов приложения (расхождение с БД) всё же берётся", async () => {
    const h = harness();
    h.repo.add(EMAIL, { next_attempt_at: new Date(T0.getTime() + 5_000) });
    const res = await processNotificationQueue({ limit: 10, deps: h.deps, now: () => T0 }); // skew по умолчанию
    assert.equal(res.sent, 1);
    assert.ok(DEFAULT_DUE_SKEW_MS >= 5_000 && DEFAULT_DUE_SKEW_MS < RETRY_DELAYS_MS[0]);
  });
});

describe("processNotificationQueue: backoff +5 мин, +30 мин, +2 ч, +12 ч, затем failed", () => {
  it("расписание по попыткам", async () => {
    const h = harness();
    h.mode.email = { kind: "failed", error: "ETIMEDOUT" };
    const row = h.repo.add(EMAIL);
    const expectedDelays = [5 * MIN, 30 * MIN, 120 * MIN, 720 * MIN];
    assert.deepEqual([...RETRY_DELAYS_MS], expectedDelays);

    for (let i = 0; i < 4; i++) {
      const before = h.clock.now;
      const res = await h.run();
      assert.deepEqual(res, { sent: 0, failed: 0, retried: 1, remaining: 1 }, `попытка ${i + 1}`);
      const r = h.repo.get(row.id);
      assert.equal(r.status, "pending");
      assert.equal(r.attempts, i + 1);
      assert.equal(r.next_attempt_at.getTime(), before.getTime() + expectedDelays[i]);
      assert.equal(r.last_error, "SMTP: ETIMEDOUT");
      // до срока строка не обрабатывается
      h.clock.now = new Date(r.next_attempt_at.getTime() - 1);
      assert.equal((await h.run()).retried, 0);
      h.clock.now = r.next_attempt_at;
    }
    const last = await h.run(); // пятая попытка
    assert.deepEqual(last, { sent: 0, failed: 1, retried: 0, remaining: 0 });
    const r = h.repo.get(row.id);
    assert.equal(r.status, "failed");
    assert.equal(r.attempts, 5);
    assert.equal(h.emails.length, 5);
    h.clock.now = new Date(h.clock.now.getTime() + 24 * 60 * MIN);
    assert.equal((await h.run()).failed, 0); // failed больше не трогаем
    assert.equal(h.emails.length, 5);
  });

  it("успех на повторе: sent, last_error сброшен", async () => {
    const h = harness();
    h.mode.email = { kind: "failed", error: "ETIMEDOUT" };
    const row = h.repo.add(EMAIL);
    await h.run();
    h.mode.email = { kind: "ok", messageId: "m" };
    h.clock.now = new Date(T0.getTime() + 5 * MIN);
    assert.equal((await h.run()).sent, 1);
    const r = h.repo.get(row.id);
    assert.equal(r.status, "sent");
    assert.equal(r.attempts, 2);
    assert.equal(r.last_error, null);
  });

  it("исключение отправщика — повтор, а не падение запуска; следующие строки обрабатываются", async () => {
    const h = harness();
    h.mode.email = "throw";
    const bad = h.repo.add(EMAIL);
    const good = h.repo.add(TG);
    const res = await h.run();
    assert.deepEqual(res, { sent: 1, failed: 0, retried: 1, remaining: 1 });
    assert.equal(h.repo.get(bad.id).status, "pending");
    assert.match(h.repo.get(bad.id).last_error ?? "", /smtp boom/);
    assert.equal(h.repo.get(good.id).status, "sent");
  });

  it("Telegram 429 и 5xx — повтор по расписанию", async () => {
    const h = harness();
    h.mode.telegram = { kind: "rate_limited", retryAfterSeconds: 30, error: "Too Many Requests" };
    const row = h.repo.add(TG);
    assert.equal((await h.run()).retried, 1);
    assert.match(h.repo.get(row.id).last_error ?? "", /429/);
    h.clock.now = new Date(T0.getTime() + 5 * MIN);
    h.mode.telegram = { kind: "failed", error: "таймаут 5000 мс" };
    assert.equal((await h.run()).retried, 1);
    assert.equal(h.repo.get(row.id).attempts, 2);
  });
});

describe("processNotificationQueue: Telegram 403", () => {
  it("blocked → failed без повторов и telegram_chat_id обнулён", async () => {
    const h = harness();
    h.mode.telegram = { kind: "blocked", error: "Forbidden: bot was blocked by the user" };
    const row = h.repo.add({ ...TG, template: "customer_refund", payload: EMAIL.payload } as NotificationInput);
    const res = await h.run();
    assert.deepEqual(res, { sent: 0, failed: 1, retried: 0, remaining: 0 });
    assert.equal(h.repo.get(row.id).status, "failed");
    assert.equal(h.repo.get(row.id).attempts, 1);
    assert.deepEqual(h.repo.clearedChats, ["512398764"]);
    assert.equal(h.telegrams.length, 1);
    h.clock.now = new Date(T0.getTime() + 24 * 60 * MIN);
    await h.run();
    assert.equal(h.telegrams.length, 1);
  });
});

describe("processNotificationQueue: битый payload", () => {
  it("строка → failed с last_error, остальные строки не страдают", async () => {
    const h = harness();
    const broken = h.repo.add({ ...EMAIL, payload: { order_number: 5 } } as unknown as NotificationInput);
    const unknown = h.repo.add({ ...EMAIL, template: "nonexistent" } as unknown as NotificationInput);
    const good = h.repo.add(EMAIL);
    const res = await h.run();
    assert.deepEqual(res, { sent: 1, failed: 2, retried: 0, remaining: 0 });
    assert.equal(h.repo.get(broken.id).status, "failed");
    assert.match(h.repo.get(broken.id).last_error ?? "", /некорректный payload/);
    assert.match(h.repo.get(unknown.id).last_error ?? "", /неизвестный шаблон/);
    assert.equal(h.repo.get(good.id).status, "sent");
    assert.equal(h.emails.length, 1);
  });
});

describe("processNotificationQueue: lease — параллельные запуски не дублируют отправку", () => {
  it("два одновременных запуска отправляют строку один раз", async () => {
    const h = harness();
    h.mode.email = async () => { await new Promise((r) => setTimeout(r, 20)); return { kind: "ok", messageId: "m" }; };
    const row = h.repo.add(EMAIL);
    const [a, b] = await Promise.all([h.run(), h.run()]);
    assert.equal(h.emails.length, 1);
    assert.equal(a.sent + b.sent, 1);
    assert.equal(h.repo.get(row.id).status, "sent");
  });

  it("захват продлевает next_attempt_at на LEASE_MS: запуск, упавший посреди отправки, не блокирует строку навсегда", async () => {
    const h = harness();
    const row = h.repo.add(EMAIL);
    const claimed = await h.repo.claim(row.id, T0, new Date(T0.getTime() + LEASE_MS));
    assert.ok(claimed);
    assert.equal(h.repo.get(row.id).next_attempt_at.getTime(), T0.getTime() + LEASE_MS);
    assert.equal((await h.run()).sent, 0); // «чужой» lease действует
    assert.equal(await h.repo.claim(row.id, T0, new Date(T0.getTime() + LEASE_MS)), null);
    h.clock.now = new Date(T0.getTime() + LEASE_MS);
    assert.equal((await h.run()).sent, 1); // lease истёк — строка снова в работе
  });

  it("строка, которую уже забрал другой запуск между listDue и claim, пропускается", async () => {
    const h = harness();
    const row = h.repo.add(EMAIL);
    const realList = h.repo.listDue.bind(h.repo);
    h.repo.listDue = async (d, l) => {
      const list = await realList(d, l);
      await h.repo.claim(row.id, d, new Date(T0.getTime() + LEASE_MS)); // «конкурент» успел
      return list;
    };
    assert.deepEqual(await h.run(), { sent: 0, failed: 0, retried: 0, remaining: 1 });
    assert.equal(h.emails.length, 0);
  });
});

describe("processNotificationQueue: устойчивость", () => {
  it("сбой БД при выборке: не бросает, возвращает error и пишет структурный лог", async () => {
    const log = mock.method(console, "error", () => {});
    const h = harness();
    h.repo.listDue = async () => { throw new Error("connection refused"); };
    const res = await h.run();
    assert.equal(res.sent, 0);
    assert.match(res.error ?? "", /connection refused/);
    assert.equal(log.mock.callCount(), 1);
  });

  it("last_error не содержит токен бота", async () => {
    const h = harness();
    const token = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw-x";
    h.mode.email = "throw";
    h.deps.sendEmail = async () => { throw new Error(`request to https://api.telegram.org/bot${token}/x failed`); };
    const row = h.repo.add(EMAIL);
    await h.run();
    assert.ok(!(h.repo.get(row.id).last_error ?? "").includes("AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"));
  });

  it("budgetMs: после исчерпания бюджета новые строки не начинаются", async () => {
    const h = harness();
    h.repo.add({ ...EMAIL, recipient: "a@x.test" });
    h.repo.add({ ...EMAIL, recipient: "b@x.test" });
    let t = 0;
    const res = await processNotificationQueue({
      limit: 10, deps: h.deps, now: () => T0, dueSkewMs: 0, budgetMs: 1000, clock: () => { t += 600; return t; },
    });
    assert.equal(res.sent, 1);
    assert.equal(res.remaining, 1);
  });
});

describe("kickNotificationQueue", () => {
  it("вне request-scope after() бросает → выполняется inline и дожидается", async () => {
    let ran = 0;
    await kickNotificationQueue(7, async (limit) => { assert.equal(limit, 7); ran++; });
    assert.equal(ran, 1);
  });

  it("ошибка в разборе не пробрасывается", async () => {
    const log = mock.method(console, "error", () => {});
    await kickNotificationQueue(10, async () => { throw new Error("db down"); });
    assert.equal(log.mock.callCount(), 1);
  });

  it("зависший разбор не держит вызывающего дольше бюджета", async () => {
    const started = Date.now();
    await kickNotificationQueue(10, () => new Promise(() => {}), 50);
    assert.ok(Date.now() - started < 1000);
  });
});
