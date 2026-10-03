import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

// Fake-сервер ЮKassa API v3 для тестов (node:http на эфемерном порту, поднимается внутри теста).
// Поведение по умолчанию — как у ЮKassa: Basic-аутентификация, Idempotence-Key обязателен на POST и даёт тот же объект
// при повторе, GET возвращает текущее состояние. Перехватчики позволяют вернуть 5xx / 4xx / битый ответ / «зависнуть».

export interface FakeRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  body: unknown;
}
export type Reply = { status: number; json?: unknown; text?: string };
export type FakeReply = Reply | "hang";
/** undefined — передать обработку дальше (следующему перехватчику / поведению по умолчанию). */
export type Interceptor = (req: FakeRequest) => FakeReply | undefined;

type Json = Record<string, unknown>;

export const FAKE_SHOP_ID = "123456";
export const FAKE_SECRET_KEY = "test_fake_secret_key_0001";

export class FakeYookassa {
  readonly requests: FakeRequest[] = [];
  readonly payments = new Map<string, Json>();
  readonly refunds = new Map<string, Json>();
  /** Статус, с которым создаются возвраты (succeeded как у ЮKassa для карт/СБП в большинстве случаев). */
  refundStatus: "succeeded" | "pending" | "canceled" = "succeeded";
  private readonly byKey = new Map<string, Json>();
  private interceptors: Interceptor[] = [];
  private server: Server | null = null;
  url = "";

  constructor(private readonly shopId = FAKE_SHOP_ID, private readonly secretKey = FAKE_SECRET_KEY) {}

  async start(): Promise<this> {
    this.server = createServer((req, res) => void this.onRequest(req, res));
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${port}/v3`;
    return this;
  }

  async stop(): Promise<void> {
    const s = this.server;
    if (!s) return;
    s.closeAllConnections();
    await new Promise<void>((resolve) => s.close(() => resolve()));
    this.server = null;
  }

  intercept(fn: Interceptor): void {
    this.interceptors.push(fn);
  }

  /** Перехват ровно n первых совпадающих запросов. */
  interceptTimes(n: number, match: (r: FakeRequest) => boolean, reply: FakeReply): void {
    let left = n;
    this.intercept((r) => (left > 0 && match(r) ? (left--, reply) : undefined));
  }

  clearInterceptors(): void {
    this.interceptors = [];
  }

  /** Полный сброс состояния между тестами (платежи, возвраты, ключи идемпотентности, журнал, перехватчики). */
  reset(): void {
    this.interceptors = [];
    this.requests.length = 0;
    this.payments.clear();
    this.refunds.clear();
    this.byKey.clear();
    this.refundStatus = "succeeded";
  }

  /** Перевести платёж (как будто покупатель оплатил / отменил на странице ЮKassa). */
  setPayment(id: string, patch: Json): Json {
    const p = this.payments.get(id);
    if (!p) throw new Error(`fake: нет платежа ${id}`);
    Object.assign(p, patch);
    return p;
  }

  succeed(id: string, method: "bank_card" | "sbp" = "sbp", extra: Json = {}): Json {
    return this.setPayment(id, {
      status: "succeeded", paid: true, captured_at: new Date().toISOString(),
      payment_method: { type: method, id, saved: false }, ...extra,
    });
  }

  cancel(id: string, reason = "insufficient_funds"): Json {
    return this.setPayment(id, { status: "canceled", paid: false, cancellation_details: { party: "payment_network", reason } });
  }

  /** Платёж, созданный «в обход» нашего кода (для сценариев восстановления строки payments). */
  addPayment(p: Json): Json {
    this.payments.set(String(p.id), p);
    return p;
  }

  private authOk(h: string | string[] | undefined): boolean {
    return h === "Basic " + Buffer.from(`${this.shopId}:${this.secretKey}`).toString("base64");
  }

  private async onRequest(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    let body: unknown = null;
    try { body = rawBody ? JSON.parse(rawBody) : null; } catch { body = rawBody; }
    const r: FakeRequest = { method: req.method ?? "", path: req.url ?? "", headers: req.headers, rawBody, body };
    this.requests.push(r);

    for (const fn of this.interceptors) {
      const reply = fn(r);
      if (reply === "hang") return; // не отвечаем: клиент упирается в таймаут
      if (reply) return this.send(res, reply);
    }
    return this.send(res, this.route(r));
  }

  private send(res: ServerResponse, reply: Reply) {
    const text = reply.text ?? (reply.json === undefined ? "" : JSON.stringify(reply.json));
    res.writeHead(reply.status, { "Content-Type": "application/json" });
    res.end(text);
  }

  private error(status: number, code: string, description: string): Reply {
    return { status, json: { type: "error", id: randomUUID(), code, description } };
  }

  private route(r: FakeRequest): Reply {
    if (!this.authOk(r.headers.authorization)) {
      return this.error(401, "invalid_credentials", "Login or password is incorrect");
    }
    const key = r.headers["idempotence-key"];
    const k = typeof key === "string" ? key : null;
    const b = (r.body ?? {}) as Json;

    if (r.method === "POST" && r.path === "/v3/payments") {
      if (!k) return this.error(400, "invalid_request", "Idempotence key is missing");
      const known = this.byKey.get(`p:${k}`);
      if (known) return { status: 200, json: this.payments.get(String(known.id)) };
      const id = randomUUID();
      const p: Json = {
        id, status: "pending", paid: false, amount: b.amount, description: b.description,
        recipient: { account_id: this.shopId, gateway_id: "100500" },
        created_at: new Date().toISOString(),
        confirmation: { type: "redirect", return_url: (b.confirmation as Json | undefined)?.return_url, confirmation_url: `https://yoomoney.ru/checkout/payments/v2/contract?orderId=${id}` },
        test: true, refundable: false, metadata: b.metadata,
      };
      this.payments.set(id, p);
      this.byKey.set(`p:${k}`, p);
      return { status: 200, json: p };
    }

    if (r.method === "POST" && r.path === "/v3/refunds") {
      if (!k) return this.error(400, "invalid_request", "Idempotence key is missing");
      const known = this.byKey.get(`r:${k}`);
      if (known) return { status: 200, json: known };
      const id = randomUUID();
      const refund: Json = {
        id, payment_id: b.payment_id, status: this.refundStatus, amount: b.amount, description: b.description,
        created_at: new Date().toISOString(),
        ...(this.refundStatus === "canceled" ? { cancellation_details: { party: "yoo_money", reason: "insufficient_funds" } } : {}),
      };
      this.refunds.set(id, refund);
      this.byKey.set(`r:${k}`, refund);
      return { status: 200, json: refund };
    }

    const pm = /^\/v3\/payments\/([^/]+)$/.exec(r.path);
    if (r.method === "GET" && pm) {
      const p = this.payments.get(pm[1]);
      return p ? { status: 200, json: p } : (this.error(404, "not_found", "Payment not found"));
    }
    const rm = /^\/v3\/refunds\/([^/]+)$/.exec(r.path);
    if (r.method === "GET" && rm) {
      const x = this.refunds.get(rm[1]);
      return x ? { status: 200, json: x } : (this.error(404, "not_found", "Refund not found"));
    }
    return this.error(404, "not_found", "Unknown path");
  }
}
