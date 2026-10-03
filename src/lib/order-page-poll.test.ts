import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_POLL_FAILURES, POLL_INTERVAL_MS, POLL_WINDOW_MS, isPaidStatus, nextPollStep, paymentGoalFlagKey,
  retryAfterDelayMs, shouldPoll, shouldReachPaymentGoal,
} from "@/lib/order-page-poll";

const ok = (status: Parameters<typeof nextPollStep>[3] & string) => ({ ok: true as const, status });
const fail = { ok: false as const };

describe("константы опроса (Блок 4)", () => {
  it("каждые 3 с до 60 с, 3 неудачи подряд", () => {
    assert.equal(POLL_INTERVAL_MS, 3000);
    assert.equal(POLL_WINDOW_MS, 60000);
    assert.equal(MAX_POLL_FAILURES, 3);
  });
});

describe("shouldPoll: когда опрашивать", () => {
  it("только после возврата с ЮKassa и при pending_payment", () => {
    assert.equal(shouldPoll(true, "pending_payment"), true);
    assert.equal(shouldPoll(false, "pending_payment"), false);
    assert.equal(shouldPoll(true, "paid"), false);
    assert.equal(shouldPoll(true, "cancelled"), false);
  });
});

describe("nextPollStep", () => {
  it("статус тот же, окно не истекло → продолжать, неудачи сбрасываются", () => {
    assert.deepEqual(nextPollStep({ failures: 2 }, ok("pending_payment"), 3000), { kind: "continue", progress: { failures: 0 } });
  });
  it("статус сменился на paid → changed (в т.ч. на cancelled)", () => {
    assert.deepEqual(nextPollStep({ failures: 0 }, ok("paid"), 6000), { kind: "changed" });
    assert.deepEqual(nextPollStep({ failures: 0 }, ok("cancelled"), 6000), { kind: "changed" });
  });
  it("статус сменился ровно на границе окна — приоритет у смены статуса", () => {
    assert.deepEqual(nextPollStep({ failures: 0 }, ok("paid"), POLL_WINDOW_MS), { kind: "changed" });
  });
  it("60 с прошли, статус тот же → timeout", () => {
    assert.deepEqual(nextPollStep({ failures: 0 }, ok("pending_payment"), POLL_WINDOW_MS - 1), { kind: "continue", progress: { failures: 0 } });
    assert.deepEqual(nextPollStep({ failures: 0 }, ok("pending_payment"), POLL_WINDOW_MS), { kind: "timeout" });
  });
  it("неудача — тихий повтор, считает подряд идущие", () => {
    assert.deepEqual(nextPollStep({ failures: 0 }, fail, 3000), { kind: "continue", progress: { failures: 1 } });
    assert.deepEqual(nextPollStep({ failures: 1 }, fail, 6000), { kind: "continue", progress: { failures: 2 } });
  });
  it("3-я неудача подряд → failed", () => {
    assert.deepEqual(nextPollStep({ failures: 2 }, fail, 9000), { kind: "failed" });
  });
  it("успех между неудачами обнуляет счётчик", () => {
    const afterFail = nextPollStep({ failures: 0 }, fail, 3000);
    assert.equal(afterFail.kind, "continue");
    if (afterFail.kind !== "continue") return;
    const afterOk = nextPollStep(afterFail.progress, ok("pending_payment"), 6000);
    assert.deepEqual(afterOk, { kind: "continue", progress: { failures: 0 } });
  });
  it("неудача после окна без трёх подряд → timeout, не ошибка", () => {
    assert.deepEqual(nextPollStep({ failures: 0 }, fail, POLL_WINDOW_MS), { kind: "timeout" });
  });
  it("полный сценарий: pending, pending, paid", () => {
    let progress = { failures: 0 };
    const steps = [ok("pending_payment"), ok("pending_payment"), ok("paid")];
    const kinds: string[] = [];
    steps.forEach((r, i) => {
      const step = nextPollStep(progress, r, (i + 1) * POLL_INTERVAL_MS);
      kinds.push(step.kind);
      if (step.kind === "continue") progress = step.progress;
    });
    assert.deepEqual(kinds, ["continue", "continue", "changed"]);
  });
});

describe("HTTP 429 в опросе (L8)", () => {
  const limited = (retryAfterMs: number) => ({ ok: false as const, rateLimited: true as const, retryAfterMs });

  it("retryAfterDelayMs: секунды, по умолчанию 5 с, потолок 15 с, минимум 1 с", () => {
    assert.equal(retryAfterDelayMs(null), 5000);
    assert.equal(retryAfterDelayMs(""), 5000);
    assert.equal(retryAfterDelayMs("abc"), 5000);
    assert.equal(retryAfterDelayMs("7"), 7000);
    assert.equal(retryAfterDelayMs("15"), 15000);
    assert.equal(retryAfterDelayMs("120"), 15000);
    assert.equal(retryAfterDelayMs("0"), 1000);
  });
  it("retryAfterDelayMs: HTTP-дата", () => {
    const now = Date.parse("2026-10-03T09:00:00Z");
    assert.equal(retryAfterDelayMs("Sat, 03 Oct 2026 09:00:09 GMT", now), 9000);
    assert.equal(retryAfterDelayMs("Sat, 03 Oct 2026 10:00:00 GMT", now), 15000);
    assert.equal(retryAfterDelayMs("Sat, 03 Oct 2026 08:00:00 GMT", now), 1000);
  });
  it("429 не увеличивает счётчик неудач и задаёт паузу", () => {
    assert.deepEqual(nextPollStep({ failures: 2 }, limited(7000), 9000), {
      kind: "continue", progress: { failures: 2 }, delayMs: 7000,
    });
  });
  it("сколько бы 429 ни пришло подряд — failed не наступает", () => {
    let progress = { failures: 0 };
    for (let i = 0; i < 10; i++) {
      const step = nextPollStep(progress, limited(1000), i * 1000);
      assert.equal(step.kind, "continue");
      if (step.kind === "continue") progress = step.progress;
    }
    assert.deepEqual(progress, { failures: 0 });
  });
  it("429 между двумя неудачами не сбрасывает счётчик: 3-я настоящая неудача → failed", () => {
    let progress = { failures: 0 };
    const results = [fail, limited(5000), fail];
    const kinds: string[] = [];
    results.forEach((r, i) => {
      const step = nextPollStep(progress, r, (i + 1) * 3000);
      kinds.push(step.kind);
      if (step.kind === "continue") progress = step.progress;
    });
    assert.deepEqual(kinds, ["continue", "continue", "continue"]);
    assert.equal(nextPollStep(progress, fail, 12000).kind, "failed");
  });
  it("потолок 60 с сохраняется: пауза за пределы окна → timeout", () => {
    assert.deepEqual(nextPollStep({ failures: 0 }, limited(5000), POLL_WINDOW_MS - 5000), { kind: "timeout" });
    assert.equal(nextPollStep({ failures: 0 }, limited(5000), POLL_WINDOW_MS - 5001).kind, "continue");
  });
});

describe("payment_succeeded", () => {
  it("статус сменился pending_payment → paid при опросе", () => {
    assert.equal(shouldReachPaymentGoal(true, "pending_payment", "paid"), true);
  });
  it("открытие уже оплаченного заказа с ?from=payment", () => {
    assert.equal(shouldReachPaymentGoal(true, null, "paid"), true);
    assert.equal(shouldReachPaymentGoal(true, null, "shipped"), true);
  });
  it("открытие оплаченного заказа из письма (без from=payment) — цели нет", () => {
    assert.equal(shouldReachPaymentGoal(false, null, "paid"), false);
  });
  it("не оплачено / отменено / возврат — цели нет", () => {
    assert.equal(shouldReachPaymentGoal(true, null, "pending_payment"), false);
    assert.equal(shouldReachPaymentGoal(true, "pending_payment", "cancelled"), false);
    assert.equal(shouldReachPaymentGoal(true, null, "refunded"), false);
  });
  it("переходы между оплаченными статусами цель не повторяют", () => {
    assert.equal(shouldReachPaymentGoal(true, "paid", "confirmed"), false);
  });
  it("isPaidStatus и ключ флага", () => {
    assert.equal(isPaidStatus("delivered"), true);
    assert.equal(isPaidStatus("pending_payment"), false);
    assert.equal(paymentGoalFlagKey("FC-26-000123"), "fc_goal_payment_FC-26-000123");
  });
});
