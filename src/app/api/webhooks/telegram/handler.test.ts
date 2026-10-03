import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, describe, it, mock } from "node:test";
import {
  MSG_FIT, MSG_FORWARDED, MSG_GREETING, MSG_LINK_INVALID, MSG_STOPPED, TELEGRAM_BOT_RATE_LIMIT, createTelegramWebhookHandler,
  type TelegramBotDeps,
} from "@/app/api/webhooks/telegram/handler";
import type { TelegramMessage, TelegramResult } from "@/lib/telegram";

const SECRET = "s".repeat(40);
const ADMIN = "777000111";
const USER = 512398764;
const TOKEN = "Xq3vR9kPz2LmN7bT4wYc8HdJ1sFa6GeU"; // 32 символа
const VEHICLE_ID = "6f1d3a52-9b0e-4c7a-8d21-3e5f7a9b1c04";
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

interface Order { id: string; number: string; status: string; telegram_chat_id: string | null }

function setup(over: { sendResult?: TelegramResult<TelegramMessage>; forwardResult?: TelegramResult<TelegramMessage>; failDb?: boolean; vehicle?: string | null | "throw"; rateLimit?: (key: string) => boolean | "throw" } = {}) {
  const calls: string[] = []; // порядок обращений
  const seenHashes: string[] = [];
  const limitCalls: Array<{ key: string; limit: number; windowSeconds: number }> = [];
  const sent: Array<{ chatId: string; text: string }> = [];
  const forwarded: Array<{ chatId: string; from: string; messageId: number }> = [];
  const orders: Order[] = [{ id: "o-1", number: "FC-26-000123", status: "paid", telegram_chat_id: null }, { id: "o-2", number: "FC-26-000124", status: "pending_payment", telegram_chat_id: null }];
  const hashes = new Map<string, string>([[sha(TOKEN), "o-1"]]);
  const deps: TelegramBotDeps = {
    secret: SECRET,
    adminChatId: ADMIN,
    telegram: {
      sendMessage: async (chatId, text) => { calls.push("sendMessage"); sent.push({ chatId: String(chatId), text }); return over.sendResult ?? { kind: "ok", result: { message_id: 1 } }; },
      forwardMessage: async (chatId, from, messageId) => { calls.push("forwardMessage"); forwarded.push({ chatId: String(chatId), from: String(from), messageId }); return over.forwardResult ?? { kind: "ok", result: { message_id: 2 } }; },
    },
    hashToken: sha,
    orders: {
      findByTokenHash: async (hash) => {
        calls.push("db.find");
        seenHashes.push(hash);
        if (over.failDb) throw new Error("db down");
        const id = hashes.get(hash);
        const o = orders.find((x) => x.id === id);
        return o ? { id: o.id, number: o.number, status: o.status } : null;
      },
      subscribe: async (orderId, chatId) => { calls.push("db.subscribe"); const o = orders.find((x) => x.id === orderId); if (o) o.telegram_chat_id = chatId; },
      unsubscribe: async (chatId) => { calls.push("db.unsubscribe"); for (const o of orders) if (o.telegram_chat_id === chatId) o.telegram_chat_id = null; },
    },
    rateLimit: async (key, limit, windowSeconds) => {
      limitCalls.push({ key, limit, windowSeconds });
      const r = over.rateLimit?.(key) ?? true;
      if (r === "throw") throw new Error("rate limit storage down");
      return r;
    },
    vehicleLabel: async () => { calls.push("vehicle"); if (over.vehicle === "throw") throw new Error("x"); return over.vehicle === undefined ? "BMW 5 Series G30" : over.vehicle; },
  };
  const POST = createTelegramWebhookHandler(() => deps);
  return { POST, calls, sent, forwarded, orders, seenHashes, limitCalls };
}

const update = (text: string | undefined, chatId = USER, type = "private", extra: Record<string, unknown> = {}) => ({
  update_id: 829104772,
  message: { message_id: 41, from: { id: chatId, is_bot: false, first_name: "Артём" }, chat: { id: chatId, type, first_name: "Артём" }, date: 1790846100, ...(text !== undefined ? { text } : {}), ...extra },
});
const req = (body: unknown, secret: string | null = SECRET) => new Request("https://forgecarbon.vercel.app/api/webhooks/telegram", {
  method: "POST", headers: { "content-type": "application/json", ...(secret !== null ? { "x-telegram-bot-api-secret-token": secret } : {}) },
  body: typeof body === "string" ? body : JSON.stringify(body),
});
const OK = { data: { ok: true } };

afterEach(() => mock.restoreAll());

describe("POST /api/webhooks/telegram: секрет", () => {
  for (const [name, secret] of [["нет заголовка", null], ["неверный", "x".repeat(40)], ["пустой", ""], ["префикс", SECRET.slice(0, 39)], ["длиннее", `${SECRET}a`]] as const) {
    it(`${name} → 403 «Неверный секрет» до любых обращений к БД и Telegram`, async () => {
      const t = setup();
      const res = await t.POST(req(update(`/start o_${TOKEN}`), secret));
      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { error: { code: "FORBIDDEN", message: "Неверный секрет" } });
      assert.deepEqual(t.calls, []);
    });
  }

  it("верный секрет → 200 { data: { ok: true } }", async () => {
    const t = setup();
    const res = await t.POST(req(update("привет", ADMIN as unknown as number)));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), OK);
    assert.equal(res.headers.get("cache-control"), "no-store");
  });
});

describe("/start o_<token>", () => {
  it("подписка: записывает chat_id, отвечает дословно с подписью статуса", async () => {
    const t = setup();
    const res = await t.POST(req(update(`/start o_${TOKEN}`)));
    assert.deepEqual(await res.json(), OK);
    assert.equal(t.orders[0].telegram_chat_id, String(USER));
    assert.deepEqual(t.sent, [{ chatId: String(USER), text: "Подписка на заказ FC-26-000123 оформлена. Текущий статус: Оплачен" }]);
    assert.deepEqual(t.forwarded, []);
  });

  it("поиск по sha256(token)", async () => {
    const t = setup();
    await t.POST(req(update(`/start o_${TOKEN}`)));
    assert.deepEqual(t.seenHashes, [sha(TOKEN)]);
  });

  it("неизвестный токен → «Ссылка недействительна…», подписки нет", async () => {
    const t = setup();
    const res = await t.POST(req(update(`/start o_${"Z".repeat(32)}`)));
    assert.deepEqual(await res.json(), OK);
    assert.deepEqual(t.sent, [{ chatId: String(USER), text: "Ссылка недействительна. Откройте страницу заказа из письма и нажмите кнопку ещё раз" }]);
    assert.equal(MSG_LINK_INVALID, t.sent[0].text);
    assert.ok(t.orders.every((o) => o.telegram_chat_id === null));
  });

  it("токен неверного формата (длина / символы) → та же «Ссылка недействительна», БД не опрашивается", async () => {
    for (const bad of ["short", "a".repeat(33), `${"a".repeat(31)}!`, ""]) {
      const t = setup();
      await t.POST(req(update(`/start o_${bad}`)));
      assert.equal(t.sent[0]?.text, MSG_LINK_INVALID, bad);
      assert.ok(!t.calls.includes("db.find"), bad);
    }
  });

  it("статус в ответе — подпись из order-labels; HTML-символы экранируются", async () => {
    const t = setup();
    t.orders[0].status = "shipped";
    await t.POST(req(update(`/start o_${TOKEN}`)));
    assert.equal(t.sent[0].text, "Подписка на заказ FC-26-000123 оформлена. Текущий статус: Передан в доставку");
    const t2 = setup();
    t2.orders[0].number = "FC<1>&";
    await t2.POST(req(update(`/start o_${TOKEN}`)));
    assert.equal(t2.sent[0].text, "Подписка на заказ FC&lt;1&gt;&amp; оформлена. Текущий статус: Оплачен");
  });
});

describe("/start fit_<vehicle_id>", () => {
  it("ответ клиенту дословно и «Запрос подбора» админу с названием авто и chat id", async () => {
    const t = setup();
    const res = await t.POST(req(update(`/start fit_${VEHICLE_ID}`)));
    assert.deepEqual(await res.json(), OK);
    assert.deepEqual(t.sent, [
      { chatId: String(USER), text: "Напишите модель, год и что ищете — инженер ответит в этом чате в рабочее время (10:00–20:00 МСК)" },
      { chatId: ADMIN, text: `Запрос подбора: BMW 5 Series G30, чат ${USER}` },
    ]);
    assert.equal(MSG_FIT, t.sent[0].text);
  });

  it("автомобиль не найден или ошибка чтения — в запросе админу id", async () => {
    for (const vehicle of [null, "throw"] as const) {
      const t = setup({ vehicle });
      mock.method(console, "error", () => {});
      await t.POST(req(update(`/start fit_${VEHICLE_ID}`)));
      assert.equal(t.sent[1].text, `Запрос подбора: ${VEHICLE_ID}, чат ${USER}`);
      mock.restoreAll();
    }
  });

  it("название авто экранируется", async () => {
    const t = setup({ vehicle: "<b>X</b> & Y" });
    await t.POST(req(update(`/start fit_${VEHICLE_ID}`)));
    assert.equal(t.sent[1].text, `Запрос подбора: &lt;b&gt;X&lt;/b&gt; &amp; Y, чат ${USER}`);
  });

  it("не-uuid после fit_ — обычный текст (пересылка админу)", async () => {
    const t = setup();
    await t.POST(req(update("/start fit_notauuid")));
    assert.deepEqual(t.forwarded, [{ chatId: ADMIN, from: String(USER), messageId: 41 }]);
  });
});

describe("голый /start — приветствие", () => {
  it("«/start» и «/start@bot» → приветствие дословно, админу не пересылается, БД не опрашивается", async () => {
    for (const text of ["/start", "/start@forgecarbon_bot", "  /start  "]) {
      const t = setup();
      const res = await t.POST(req(update(text)));
      assert.deepEqual(await res.json(), OK);
      assert.deepEqual(t.sent, [{ chatId: String(USER), text: "Это бот ForgeCarbon. Статусы заказа приходят по ссылке из письма. Вопрос — напишите сюда, передам инженеру." }]);
      assert.equal(MSG_GREETING, t.sent[0].text);
      assert.deepEqual(t.forwarded, []);
      assert.ok(!t.calls.includes("db.find"));
    }
  });
});

describe("лимит бота tg:<chat_id>", () => {
  it("ключ tg:<chat_id>, 10 сообщений за 60 с", async () => {
    const t = setup();
    await t.POST(req(update("вопрос")));
    assert.deepEqual(t.limitCalls, [{ key: `tg:${USER}`, limit: 10, windowSeconds: 60 }]);
    assert.deepEqual(TELEGRAM_BOT_RATE_LIMIT, { limit: 10, windowSeconds: 60 });
  });

  it("сверх лимита — 200, ни БД, ни Telegram не трогаются", async () => {
    const t = setup({ rateLimit: () => false });
    const res = await t.POST(req(update(`/start o_${TOKEN}`)));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), OK);
    assert.deepEqual(t.calls, []);
    assert.ok(t.orders.every((o) => o.telegram_chat_id === null));
  });

  it("лимит считается по чату: другой чат не страдает", async () => {
    const t = setup({ rateLimit: (key) => key !== `tg:${USER}` });
    await t.POST(req(update("вопрос")));
    assert.deepEqual(t.calls, []);
    await t.POST(req(update("вопрос", 42)));
    assert.deepEqual(t.calls, ["forwardMessage", "sendMessage"]);
  });

  it("сбой хранилища лимитов — fail-open: сообщение обрабатывается", async () => {
    mock.method(console, "error", () => {});
    const t = setup({ rateLimit: () => "throw" });
    await t.POST(req(update("вопрос")));
    assert.deepEqual(t.calls, ["forwardMessage", "sendMessage"]);
  });

  it("не private-чат и неверный секрет лимит не расходуют", async () => {
    const t = setup();
    await t.POST(req(update("x", -1, "group")));
    await t.POST(req(update("x"), "bad"));
    assert.deepEqual(t.limitCalls, []);
  });
});

describe("/stop", () => {
  it("обнуляет telegram_chat_id у всех заказов чата и отвечает «Уведомления отключены»", async () => {
    const t = setup();
    t.orders[0].telegram_chat_id = String(USER);
    t.orders[1].telegram_chat_id = String(USER);
    const res = await t.POST(req(update("/stop")));
    assert.deepEqual(await res.json(), OK);
    assert.ok(t.orders.every((o) => o.telegram_chat_id === null));
    assert.deepEqual(t.sent, [{ chatId: String(USER), text: "Уведомления отключены" }]);
    assert.equal(MSG_STOPPED, "Уведомления отключены");
  });

  it("не трогает подписки других чатов", async () => {
    const t = setup();
    t.orders[0].telegram_chat_id = "999";
    await t.POST(req(update("/stop")));
    assert.equal(t.orders[0].telegram_chat_id, "999");
  });
});

describe("прочий текст → админу", () => {
  it("forwardMessage в TELEGRAM_ADMIN_CHAT_ID и ответ «Передал инженеру…»", async () => {
    const t = setup();
    const res = await t.POST(req(update("Подойдут ли диски на G30 2019?")));
    assert.deepEqual(await res.json(), OK);
    assert.deepEqual(t.forwarded, [{ chatId: ADMIN, from: String(USER), messageId: 41 }]);
    assert.deepEqual(t.sent, [{ chatId: String(USER), text: "Передал инженеру. Ответим в рабочее время" }]);
    assert.equal(MSG_FORWARDED, t.sent[0].text);
    assert.deepEqual(t.calls, ["forwardMessage", "sendMessage"]);
  });

  it("фото, стикер, документ (нет text) — пересылаются админу, ответ «Передал…»", async () => {
    for (const extra of [{ photo: [{ file_id: "a" }] }, { sticker: { file_id: "b" } }, { document: { file_id: "c" } }]) {
      const t = setup();
      const res = await t.POST(req(update(undefined, USER, "private", extra)));
      assert.deepEqual(await res.json(), OK);
      assert.deepEqual(t.forwarded, [{ chatId: ADMIN, from: String(USER), messageId: 41 }]);
      assert.deepEqual(t.sent, [{ chatId: String(USER), text: MSG_FORWARDED }]);
    }
  });

  it("нетекстовое сообщение из чата админа не пересылается", async () => {
    const t = setup();
    await t.POST(req(update(undefined, Number(ADMIN), "private", { photo: [{ file_id: "a" }] })));
    assert.deepEqual(t.calls, []);
  });

  it("сообщения из чата админа не пересылаются и без ответа", async () => {
    const t = setup();
    await t.POST(req(update("Ответ клиенту", Number(ADMIN))));
    assert.deepEqual(t.calls, []);
  });

  it("админ может подписаться на заказ (проверка) — команды работают и для админа", async () => {
    const t = setup();
    await t.POST(req(update(`/start o_${TOKEN}`, Number(ADMIN))));
    assert.equal(t.orders[0].telegram_chat_id, ADMIN);
  });

  it("не private-чат, пустой текст, нет message — игнорируются, 200", async () => {
    const t = setup();
    for (const body of [update("привет", -100500, "group"), update("  "), { update_id: 1 }, update("x", USER, "channel")]) {
      const res = await t.POST(req(body));
      assert.equal(res.status, 200);
    }
    assert.deepEqual(t.calls, []);
  });

  it("пересылка не удалась — «Передал» не отправляется, ответ 200, лог без ПДн", async () => {
    const log = mock.method(console, "error", () => {});
    const t = setup({ forwardResult: { kind: "failed", error: "таймаут" } });
    const res = await t.POST(req(update("вопрос")));
    assert.equal(res.status, 200);
    assert.deepEqual(t.sent, []);
    assert.equal(log.mock.callCount(), 1);
    assert.ok(!JSON.stringify(log.mock.calls[0].arguments).includes(String(USER)));
  });
});

describe("устойчивость: всегда 200", () => {
  it("сбой БД → 200, ошибка в логе без токена и ПДн", async () => {
    const log = mock.method(console, "error", () => {});
    const t = setup({ failDb: true });
    const res = await t.POST(req(update(`/start o_${TOKEN}`)));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), OK);
    assert.equal(log.mock.callCount(), 1);
    const logged = JSON.stringify(log.mock.calls[0].arguments);
    assert.ok(!logged.includes(TOKEN));
    assert.ok(!logged.includes(String(USER)));
  });

  it("Telegram не принял ответ → 200", async () => {
    mock.method(console, "error", () => {});
    const t = setup({ sendResult: { kind: "blocked", error: "Forbidden" } });
    assert.equal((await t.POST(req(update("/stop")))).status, 200);
  });

  it("битый JSON и не-объект → 200 (с верным секретом)", async () => {
    mock.method(console, "error", () => {});
    const t = setup();
    for (const body of ["{not json", "[]", "null", JSON.stringify({ update_id: "x" })]) {
      const res = await t.POST(req(body));
      assert.equal(res.status, 200, body);
    }
    assert.deepEqual(t.calls, []);
  });

  it("сбой конфигурации (env) → 500, а не пропуск без проверки секрета", async () => {
    mock.method(console, "error", () => {});
    const POST = createTelegramWebhookHandler(() => { throw new Error("env invalid"); });
    assert.equal((await POST(req(update("x")))).status, 500);
  });
});
