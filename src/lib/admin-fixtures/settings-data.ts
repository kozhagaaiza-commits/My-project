import type { AdminRatesRefresh, AdminRecalculateResult, AdminSettings } from "@/lib/admin-ui/types";

export interface SettingsState {
  settings: Omit<AdminSettings, "rates">;
  ratesDate: string | null;
  usd: number;
  cny: number;
}

export const initialSettingsState = (): SettingsState => ({
  settings: { markup_multiplier: 2, price_rounding_rub: 100, auto_reprice: true, reprice_threshold: 2, updated_at: "2026-10-01T06:00:12.000Z" },
  ratesDate: "2026-10-01",
  usd: 83.56,
  cny: 11.72,
});

interface Reply {
  status: number;
  body: unknown;
}

const ok = (data: unknown): Reply => ({ status: 200, body: { data } });
const err = (status: number, code: string, message: string): Reply => ({ status, body: { error: { code, message } } });

const CHANGES = [
  { product_id: "8c1f4e2a-5b7d-4e3a-9f12-6a0d3c9b7e51", title: "Кованый моноблок M-01 R20, 5×112, графит", old_price_formatted: "133 700 ₽", new_price_formatted: "135 200 ₽" },
  { product_id: "5a2e7c91-0d4b-4c68-a3f1-7b9e2d6c4a10", title: "Литой диск L-04 R19, 5×120, серебро", old_price_formatted: "64 900 ₽", new_price_formatted: "65 600 ₽" },
];

/** Настройки, курс ЦБ и пересчёт цен (Блок 3, «Админка — ателье, настройки, сводка»). null — маршрут не распознан. */
export function handleSettingsRoute(state: SettingsState, method: string, parts: string[], body: Record<string, unknown>): Reply | null {
  const [, , section, id] = parts;
  if (section === "settings" && method === "GET") {
    const rates = state.ratesDate ? { USD: { rate: state.usd, date: state.ratesDate }, CNY: { rate: state.cny, date: state.ratesDate } } : {};
    return ok({ ...state.settings, rates });
  }
  if (section === "settings" && method === "PATCH") {
    const m = body.markup_multiplier;
    if (typeof m === "number" && (m < 1 || m > 5)) {
      return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "Множитель от 1.00 до 5.00", details: { fields: { markup_multiplier: ["Множитель от 1.00 до 5.00"] } } } } };
    }
    state.settings = { ...state.settings, ...body, updated_at: new Date().toISOString() };
    return ok(state.settings);
  }
  if (section === "exchange-rates" && id === "refresh" && method === "POST") {
    state.ratesDate = "2026-10-03";
    state.usd = 83.9;
    const data: AdminRatesRefresh = {
      USD: { rate: state.usd, date: state.ratesDate, inserted: true },
      CNY: { rate: state.cny, date: state.ratesDate, inserted: true },
    };
    return ok(data);
  }
  if (section === "prices" && id === "recalculate" && method === "POST") {
    if (!state.ratesDate) return err(422, "RATE_NOT_LOADED", "Курс USD не загружен");
    const data: AdminRecalculateResult = { dry_run: body.dry_run === true, changes: CHANGES, unchanged: 17, skipped: [{ product_id: "skip-1", title: "Карбоновый сплиттер (демо)", reason: "Цена ателье выше новой розничной цены" }] };
    return ok(data);
  }
  return null;
}
