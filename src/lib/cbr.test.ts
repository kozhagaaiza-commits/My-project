import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  CbrError, fetchCbrRates, formatE4, parseCbrXml, rateToE4, refreshRates,
  type Currency, type ExchangeRateInsert, type ExchangeRatesRepo, type RefreshResult,
} from "@/lib/cbr";
import { FakeCbr, cbrXml, encodeWin1251 } from "@/lib/__fixtures__/fake-cbr";

const NOW = new Date("2026-10-01T12:00:00Z");
const noSleep = async () => {};

/** Репозиторий в памяти с семантикой unique (currency, rate_date) + on conflict do nothing. */
class MemoryRatesRepo implements ExchangeRatesRepo {
  readonly rows: Array<{ currency: Currency; rate: string; rate_date: string }> = [];
  inserts = 0;
  async insertMissing(rows: ExchangeRateInsert[]): Promise<Currency[]> {
    this.inserts += 1;
    const added: Currency[] = [];
    for (const r of rows) {
      if (this.rows.some((x) => x.currency === r.currency && x.rate_date === r.rate_date)) continue;
      this.rows.push({ ...r });
      added.push(r.currency);
    }
    return added;
  }
  async getRates(date: string, currencies: Currency[]) {
    const out: Partial<Record<Currency, number>> = {};
    for (const r of this.rows) if (r.rate_date === date && currencies.includes(r.currency)) out[r.currency] = Number(r.rate);
    return out;
  }
}

describe("rateToE4 / formatE4: целочисленный разбор значения", () => {
  it("запятая и точка, Nominal 1", () => {
    assert.equal(rateToE4("83,5600", 1), 835600);
    assert.equal(rateToE4("83.56", 1), 835600);
    assert.equal(rateToE4("11,7", 1), 117000);
    assert.equal(rateToE4("83", 1), 830000);
  });
  it("Nominal 10: деление и округление половина вверх до 4 знаков", () => {
    assert.equal(rateToE4("117,2345", 10), 117235); // 11,72345 → 11,7235
    assert.equal(rateToE4("117,2344", 10), 117234); // 11,72344 → 11,7234
    assert.equal(rateToE4("117,2000", 10), 117200);
  });
  it("мусор отклоняется", () => {
    for (const bad of ["", "abc", "-1,5", "1 234,5", "83,5600,1", "83,"]) {
      assert.throws(() => rateToE4(bad, 1), (e: unknown) => e instanceof CbrError && e.kind === "parse", bad);
    }
  });
  it("formatE4 даёт строку numeric без потерь", () => {
    assert.equal(formatE4(835600), "83.5600");
    assert.equal(formatE4(117235), "11.7235");
    assert.equal(formatE4(100005), "10.0005");
  });
});

describe("parseCbrXml", () => {
  it("USD и CNY, дата из атрибута Date", () => {
    assert.deepEqual(parseCbrXml(cbrXml(), NOW), { date: "2026-10-01", USD: 83.56, CNY: 11.72 });
  });
  it("Nominal 10 для CNY", () => {
    const r = parseCbrXml(cbrXml({ cny: { nominal: 10, value: "117,2345" } }), NOW);
    assert.equal(r.CNY, 11.7235);
  });
  it("порядок тегов и пробельные символы внутри Valute не важны", () => {
    const xml = `<ValCurs Date="02.10.2026"><Valute ID="R01235"><Value> 83,5 </Value><Name>Доллар</Name><Nominal>1</Nominal><CharCode>USD</CharCode></Valute>`
      + `<Valute ID="R01375"><CharCode>CNY</CharCode><Nominal>1</Nominal><Value>11,5</Value></Valute></ValCurs>`;
    assert.deepEqual(parseCbrXml(xml, NOW), { date: "2026-10-02", USD: 83.5, CNY: 11.5 });
  });
  it("нет даты / невозможная дата / дата вне окна правдоподобия", () => {
    assert.throws(() => parseCbrXml(cbrXml().replace(/Date="[^"]*"/, ""), NOW), /no date/);
    assert.throws(() => parseCbrXml(cbrXml({ date: "31.02.2026" }), NOW), /invalid date/);
    assert.throws(() => parseCbrXml(cbrXml({ date: "01.01.2020" }), NOW), /implausible date/);
    assert.throws(() => parseCbrXml(cbrXml({ date: "01.01.2030" }), NOW), /implausible date/);
    // граница: +4 дня (выходные/праздники) допустимы
    assert.equal(parseCbrXml(cbrXml({ date: "05.10.2026" }), NOW).date, "2026-10-05");
  });
  it("нет валюты → parse-ошибка", () => {
    assert.throws(() => parseCbrXml(cbrXml({ omit: ["CNY"] }), NOW), /no CNY/);
    assert.throws(() => parseCbrXml(cbrXml({ omit: ["USD"] }), NOW), /no USD/);
  });
  it("неправдоподобный курс или Nominal", () => {
    assert.throws(() => parseCbrXml(cbrXml({ usd: { value: "0,8356" } }), NOW), /implausible USD/);
    assert.throws(() => parseCbrXml(cbrXml({ usd: { value: "8356,0000" } }), NOW), /implausible USD/);
    assert.throws(() => parseCbrXml(cbrXml({ cny: { value: "1172,0" } }), NOW), /implausible CNY/);
    assert.throws(() => parseCbrXml(cbrXml({ usd: { nominal: 0, value: "83,56" } }), NOW), /bad nominal/);
    assert.throws(() => parseCbrXml(cbrXml({ usd: { nominal: "x", value: "83,56" } }), NOW), /bad nominal/);
  });
  it("не XML → parse-ошибка", () => {
    assert.throws(() => parseCbrXml("<html>502 Bad Gateway</html>", NOW), (e: unknown) => e instanceof CbrError && e.kind === "parse");
  });
});

describe("fetchCbrRates на fake-сервере ЦБ", () => {
  let cbr: FakeCbr;
  beforeEach(async () => { cbr = await new FakeCbr().start(); });
  afterEach(async () => { await cbr.stop(); mock.restoreAll(); });

  it("windows-1251 декодируется, курс разобран; запрос один", async () => {
    // Русские названия в теле: если бы декодирование ломалось, тело всё равно парсится (ASCII), проверяем и байты.
    assert.ok(encodeWin1251("Доллар США").includes(0xc4)); // «Д» = 0xC4 в windows-1251
    const r = await fetchCbrRates({ url: cbr.url, now: () => NOW, sleep: noSleep });
    assert.deepEqual(r, { date: "2026-10-01", USD: 83.56, CNY: 11.72 });
    assert.equal(cbr.requests.length, 1);
  });

  it("retry 0 / 2 / 5 с: 500, 500, затем успех — паузы 2000 и 5000", async () => {
    cbr.script({ status: 500 }, { status: 503 });
    const sleeps: number[] = [];
    const r = await fetchCbrRates({ url: cbr.url, now: () => NOW, sleep: async (ms) => { sleeps.push(ms); } });
    assert.equal(r.USD, 83.56);
    assert.deepEqual(sleeps, [2000, 5000]);
    assert.equal(cbr.requests.length, 3);
  });

  it("3 неудачи подряд: последняя ошибка, ровно 3 запроса", async () => {
    cbr.script({ status: 500 }, { status: 502 }, { status: 503 });
    await assert.rejects(
      fetchCbrRates({ url: cbr.url, now: () => NOW, sleep: noSleep }),
      (e: unknown) => e instanceof CbrError && e.kind === "http" && e.message === "CBR HTTP 503",
    );
    assert.equal(cbr.requests.length, 3);
  });

  it("битый XML тоже повторяется, затем parse-ошибка", async () => {
    cbr.script(FakeCbr.xml("<html>oops</html>"), FakeCbr.xml("<html>oops</html>"), FakeCbr.xml("<html>oops</html>"));
    await assert.rejects(fetchCbrRates({ url: cbr.url, now: () => NOW, sleep: noSleep }), (e: unknown) => e instanceof CbrError && e.kind === "parse");
    assert.equal(cbr.requests.length, 3);
  });

  it("таймаут: зависший сервер → CbrError timeout «CBR timeout after N ms»", async () => {
    cbr.script("hang", "hang", "hang");
    await assert.rejects(
      fetchCbrRates({ url: cbr.url, timeoutMs: 60, now: () => NOW, sleep: noSleep }),
      (e: unknown) => e instanceof CbrError && e.kind === "timeout" && e.message === "CBR timeout after 60 ms",
    );
    assert.equal(cbr.requests.length, 3);
  });

  it("сеть недоступна (закрытый порт) → network", async () => {
    const url = cbr.url;
    await cbr.stop();
    await assert.rejects(
      fetchCbrRates({ url, now: () => NOW, sleep: noSleep, retryDelaysMs: [0] }),
      (e: unknown) => e instanceof CbrError && e.kind === "network",
    );
  });

  it("подмена fetchImpl: AbortSignal с таймаутом и cache: no-store передаются", async () => {
    const calls: RequestInit[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls.push(init ?? {});
      return new Response(new Uint8Array(encodeWin1251(cbrXml())), { status: 200 });
    };
    await fetchCbrRates({ fetchImpl, now: () => NOW, sleep: noSleep });
    assert.equal(calls[0]?.cache, "no-store");
    assert.ok(calls[0]?.signal instanceof AbortSignal);
  });
});

describe("refreshRates: идемпотентная запись", () => {
  const fetchRates = async () => ({ date: "2026-10-01", USD: 83.56, CNY: 11.72 });

  it("первый вызов вставляет обе валюты (rate строкой с 4 знаками)", async () => {
    const repo = new MemoryRatesRepo();
    const r = await refreshRates({ repo, fetchRates });
    assert.deepEqual(r, {
      USD: { rate: 83.56, date: "2026-10-01", inserted: true },
      CNY: { rate: 11.72, date: "2026-10-01", inserted: true },
    });
    assert.deepEqual(repo.rows, [
      { currency: "USD", rate: "83.5600", rate_date: "2026-10-01" },
      { currency: "CNY", rate: "11.7200", rate_date: "2026-10-01" },
    ]);
  });

  it("повтор в тот же день: inserted:false, строк не прибавилось", async () => {
    const repo = new MemoryRatesRepo();
    await refreshRates({ repo, fetchRates });
    const r = await refreshRates({ repo, fetchRates });
    assert.equal(r.USD.inserted, false);
    assert.equal(r.CNY.inserted, false);
    assert.equal(r.USD.rate, 83.56);
    assert.equal(repo.rows.length, 2);
  });

  it("строка на дату уже есть с другим значением: в ответе сохранённый курс, перезаписи нет", async () => {
    const repo = new MemoryRatesRepo();
    repo.rows.push({ currency: "USD", rate: "80.0000", rate_date: "2026-10-01" });
    const r = await refreshRates({ repo, fetchRates });
    assert.deepEqual(r.USD, { rate: 80, date: "2026-10-01", inserted: false });
    assert.deepEqual(r.CNY, { rate: 11.72, date: "2026-10-01", inserted: true });
    assert.equal(repo.rows.find((x) => x.currency === "USD")?.rate, "80.0000");
  });

  it("новая дата — новые строки, прошлые не трогаются", async () => {
    const repo = new MemoryRatesRepo();
    await refreshRates({ repo, fetchRates });
    const r = await refreshRates({ repo, fetchRates: async () => ({ date: "2026-10-02", USD: 84.1, CNY: 11.8 }) });
    assert.equal(r.USD.inserted, true);
    assert.equal(repo.rows.length, 4);
  });

  it("ошибка ЦБ — исключение CbrError, БД не вызывается", async () => {
    const repo = new MemoryRatesRepo();
    await assert.rejects(
      refreshRates({ repo, fetchRates: async () => { throw new CbrError("timeout", "CBR timeout after 10000 ms"); } }),
      (e: unknown) => e instanceof CbrError,
    );
    assert.equal(repo.inserts, 0);
  });

  it("ошибка БД пробрасывается", async () => {
    const repo: ExchangeRatesRepo = { insertMissing: async () => { throw new Error("db down"); }, getRates: async () => ({}) };
    await assert.rejects(refreshRates({ repo, fetchRates }), /db down/);
  });

  it("хук onNewRates: вызывается при новых строках, не вызывается при повторе, его ошибка не ломает загрузку", async () => {
    const repo = new MemoryRatesRepo();
    const seen: RefreshResult[] = [];
    const onNewRates = async (r: RefreshResult) => { seen.push(r); };
    await refreshRates({ repo, fetchRates, onNewRates });
    await refreshRates({ repo, fetchRates, onNewRates });
    assert.equal(seen.length, 1);

    const errors = mock.method(console, "error", () => {});
    const repo2 = new MemoryRatesRepo();
    const r = await refreshRates({ repo: repo2, fetchRates, onNewRates: async () => { throw new Error("reprice failed"); } });
    assert.equal(r.USD.inserted, true);
    assert.equal(errors.mock.callCount(), 1);
    mock.restoreAll();
  });
});
