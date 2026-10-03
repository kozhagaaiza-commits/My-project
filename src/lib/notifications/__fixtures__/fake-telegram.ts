import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Fake-сервер Telegram Bot API для тестов (node:http на эфемерном порту, поднимается внутри теста).
// По умолчанию отвечает { ok: true, result: { message_id: N } }; сценарий ответов задаётся очередью script().

export interface FakeTgRequest {
  method: string; // sendMessage, forwardMessage, …
  token: string;
  body: Record<string, unknown>;
}
export type FakeTgReply = { status: number; json?: unknown } | "hang";

export class FakeTelegram {
  readonly requests: FakeTgRequest[] = [];
  private readonly queue: FakeTgReply[] = [];
  private server: Server | null = null;
  private seq = 100;
  url = "";

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      void readBody(req).then((raw) => {
        const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url ?? "");
        let body: Record<string, unknown> = {};
        try { body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}; } catch { /* пустое тело */ }
        this.requests.push({ method: m?.[2] ?? "", token: m?.[1] ?? "", body });
        const next = this.queue.shift();
        if (next === "hang") return; // не отвечаем: клиент упрётся в таймаут
        const reply = next ?? { status: 200, json: { ok: true, result: { message_id: ++this.seq } } };
        res.writeHead(reply.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reply.json ?? {}));
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  async stop(): Promise<void> {
    const s = this.server;
    if (!s) return;
    s.closeAllConnections();
    await new Promise<void>((resolve) => s.close(() => resolve()));
    this.server = null;
  }

  /** Поставить в очередь ответы для следующих запросов (по порядку). */
  script(...replies: FakeTgReply[]): void { this.queue.push(...replies); }
  reset(): void { this.requests.length = 0; this.queue.length = 0; }
  of(method: string): FakeTgRequest[] { return this.requests.filter((r) => r.method === method); }
}

export const tgError = (status: number, description: string, retryAfter?: number): FakeTgReply => ({
  status,
  json: { ok: false, error_code: status, description, ...(retryAfter !== undefined ? { parameters: { retry_after: retryAfter } } : {}) },
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
