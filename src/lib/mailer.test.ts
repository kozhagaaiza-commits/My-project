import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import nodemailer from "nodemailer";
import { createMailer, type MailTransport } from "@/lib/mailer";

const MSG = { to: "artem.sokolov@yandex.ru", subject: "Заказ FC-26-000123 оплачен", html: "<p>Привет</p>", text: "Привет" };
const PASSWORD = "yandex-app-password-123";

before(() => {
  const env = process.env as Record<string, string | undefined>;
  const vars: Record<string, string> = {
    NEXT_PUBLIC_SITE_URL: "https://forgecarbon.vercel.app", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "s".repeat(40), YOOKASSA_SHOP_ID: "123456",
    YOOKASSA_SECRET_KEY: "test_secret_key", TELEGRAM_BOT_TOKEN: `123456:${"A".repeat(35)}`, TELEGRAM_BOT_USERNAME: "forgecarbon_bot",
    TELEGRAM_WEBHOOK_SECRET: "w".repeat(32), TELEGRAM_ADMIN_CHAT_ID: "-100123", SMTP_HOST: "smtp.yandex.ru", SMTP_PORT: "465",
    SMTP_USER: "orders@forgecarbon.ru", SMTP_PASSWORD: PASSWORD, CRON_SECRET: "c".repeat(32), ORDER_TOKEN_SECRET: "o".repeat(32),
  };
  for (const [k, v] of Object.entries(vars)) env[k] ??= v;
});

describe("mailer: заголовки и содержимое (jsonTransport)", () => {
  it("в транспорт уходят from, replyTo, to, subject, html и text", async () => {
    let captured: Record<string, unknown> = {};
    const spy: MailTransport = { sendMail: async (o) => { captured = o as unknown as Record<string, unknown>; return { messageId: "<m1>" }; } };
    const res = await createMailer({ transport: spy, from: "ForgeCarbon <orders@forgecarbon.ru>", replyTo: "orders@forgecarbon.ru" }).sendMail(MSG);
    assert.deepEqual(res, { kind: "ok", messageId: "<m1>" });
    assert.deepEqual(captured, {
      from: "ForgeCarbon <orders@forgecarbon.ru>", replyTo: "orders@forgecarbon.ru", to: MSG.to,
      subject: MSG.subject, html: MSG.html, text: MSG.text,
    });
  });

  it("jsonTransport: итоговое сообщение содержит from, replyTo, html и text", async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    let json = "";
    const wrap: MailTransport = { sendMail: async (o) => { const info = (await transport.sendMail(o)) as { message: string; messageId: string }; json = info.message; return info; } };
    await createMailer({ transport: wrap, from: "ForgeCarbon <orders@forgecarbon.ru>", replyTo: "orders@forgecarbon.ru" }).sendMail(MSG);
    const parsed = JSON.parse(json) as { from: { name: string; address: string }; replyTo: Array<{ address: string }>; html: string; text: string; subject: string };
    assert.deepEqual(parsed.from, { name: "ForgeCarbon", address: "orders@forgecarbon.ru" });
    assert.equal(parsed.replyTo[0].address, "orders@forgecarbon.ru");
    assert.equal(parsed.html, MSG.html);
    assert.equal(parsed.text, MSG.text);
    assert.equal(parsed.subject, MSG.subject);
  });

  it("from и replyTo по умолчанию — из env (SITE_NAME и SMTP_USER)", async () => {
    let captured: Record<string, unknown> = {};
    const spy: MailTransport = { sendMail: async (o) => { captured = o as unknown as Record<string, unknown>; return { messageId: "<id1>" }; } };
    const res = await createMailer({ transport: spy }).sendMail(MSG);
    assert.deepEqual(res, { kind: "ok", messageId: "<id1>" });
    assert.equal(captured.from, `ForgeCarbon <${process.env.SMTP_USER}>`);
    assert.equal(captured.replyTo, process.env.SMTP_USER);
  });
});

describe("mailer: retry (2 попытки, паузы 0 / 2 с)", () => {
  const cfg = { from: "ForgeCarbon <orders@forgecarbon.ru>", replyTo: "orders@forgecarbon.ru" };

  it("успех с первой попытки — без пауз", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const transport: MailTransport = { sendMail: async () => { calls++; return { messageId: "m" }; } };
    assert.equal((await createMailer({ ...cfg, transport, sleep: async (ms) => { sleeps.push(ms); } }).sendMail(MSG)).kind, "ok");
    assert.equal(calls, 1);
    assert.deepEqual(sleeps, []);
  });

  it("сбой, затем успех: пауза 2 с", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const transport: MailTransport = { sendMail: async () => { if (++calls === 1) throw new Error("ETIMEDOUT"); return { messageId: "m2" }; } };
    const res = await createMailer({ ...cfg, transport, sleep: async (ms) => { sleeps.push(ms); } }).sendMail(MSG);
    assert.deepEqual(res, { kind: "ok", messageId: "m2" });
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [2000]);
  });

  it("две неудачи: failed, ровно 2 попытки; пароль SMTP в тексте ошибки редактируется", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const transport: MailTransport = {
      sendMail: async () => {
        calls++;
        throw Object.assign(new Error(`Invalid login: 535 5.7.8 for pass ${PASSWORD}`), { code: "EAUTH" });
      },
    };
    // from/replyTo не заданы → конфигурация из env, пароль SMTP из env попадает в список скрываемых строк.
    const res = await createMailer({ transport, sleep: async (ms) => { sleeps.push(ms); } }).sendMail(MSG);
    assert.equal(res.kind, "failed");
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [2000]);
    assert.ok(!JSON.stringify(res).includes(PASSWORD));
    assert.match(JSON.stringify(res), /EAUTH/);
  });

  it("явно заданные secrets тоже редактируются", async () => {
    const transport: MailTransport = { sendMail: async () => { throw new Error("boom hunter2"); } };
    const res = await createMailer({ ...cfg, transport, sleep: async () => {}, secrets: ["hunter2"] }).sendMail(MSG);
    assert.ok(!JSON.stringify(res).includes("hunter2"));
  });
});
