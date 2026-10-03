import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Fake-сервер ЦБ РФ для тестов (node:http на эфемерном порту, поднимается внутри теста).
// Отдаёт XML_daily.asp в windows-1251, как настоящий; сценарий ответов — очередью script(), по умолчанию — «нормальный» курс.

export interface CbrXmlOptions {
  /** Дата ДД.ММ.ГГГГ в атрибуте ValCurs. */
  date?: string;
  usd?: { nominal?: number | string; value: string };
  cny?: { nominal?: number | string; value: string };
  /** Не включать валюту в ответ. */
  omit?: Array<"USD" | "CNY">;
}

/** Строка → байты windows-1251 (ASCII + кириллица + ё/Ё; остальное — «?»). */
export function encodeWin1251(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 63;
    if (cp < 0x80) bytes.push(cp);
    else if (cp >= 0x410 && cp <= 0x44f) bytes.push(cp - 0x410 + 0xc0);
    else if (cp === 0x401) bytes.push(0xa8);
    else if (cp === 0x451) bytes.push(0xb8);
    else bytes.push(63);
  }
  return Buffer.from(bytes);
}

/** XML в формате ЦБ: лишние валюты, русские названия, запятая как разделитель. */
export function cbrXml(o: CbrXmlOptions = {}): string {
  const usd = o.usd ?? { value: "83,5600" };
  const cny = o.cny ?? { nominal: 1, value: "11,7200" };
  const valute = (id: string, num: string, code: string, nominal: number | string, name: string, value: string) =>
    `<Valute ID="${id}"><NumCode>${num}</NumCode><CharCode>${code}</CharCode><Nominal>${nominal}</Nominal><Name>${name}</Name><Value>${value}</Value><VunitRate>${value}</VunitRate></Valute>`;
  const omit = new Set(o.omit ?? []);
  return [
    `<?xml version="1.0" encoding="windows-1251"?>`,
    `<ValCurs Date="${o.date ?? "01.10.2026"}" name="Foreign Currency Market">`,
    valute("R01010", "036", "AUD", 1, "Австралийский доллар", "55,1234"),
    omit.has("USD") ? "" : valute("R01235", "840", "USD", usd.nominal ?? 1, "Доллар США", usd.value),
    valute("R01239", "978", "EUR", 1, "Евро", "97,3000"),
    omit.has("CNY") ? "" : valute("R01375", "156", "CNY", cny.nominal ?? 1, "Китайский юань", cny.value),
    `</ValCurs>`,
  ].join("\r\n");
}

export type FakeCbrReply = { status: number; body?: Buffer | string } | "hang";

export class FakeCbr {
  readonly requests: string[] = [];
  private readonly queue: FakeCbrReply[] = [];
  private server: Server | null = null;
  url = "";

  constructor(private readonly defaultXml: () => string = () => cbrXml()) {}

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      this.requests.push(req.url ?? "");
      const next = this.queue.shift();
      if (next === "hang") return; // не отвечаем: клиент упрётся в таймаут
      const reply = next ?? { status: 200, body: encodeWin1251(this.defaultXml()) };
      res.writeHead(reply.status, { "Content-Type": "application/xml; charset=windows-1251" });
      res.end(reply.body ?? "");
    });
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/scripts/XML_daily.asp`;
    return this;
  }

  async stop(): Promise<void> {
    const s = this.server;
    if (!s) return;
    s.closeAllConnections();
    await new Promise<void>((resolve) => s.close(() => resolve()));
    this.server = null;
  }

  /** Ответы на следующие запросы (по порядку); без очереди — XML по умолчанию. */
  script(...replies: FakeCbrReply[]): void { this.queue.push(...replies); }
  /** Ответ XML (windows-1251) из строки. */
  static xml(xml: string, status = 200): FakeCbrReply { return { status, body: encodeWin1251(xml) }; }
}
