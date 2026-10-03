import { z } from "zod";
import { ATELIER_REJECTION_MAX, ATELIER_REJECTION_MIN } from "@/lib/admin-ui/ateliers-query";
import { atelierApplyBody } from "@/lib/schemas/ateliers";
import type { AdminAtelierListItem, AtelierApplied, MyAtelier, AtelierStatusValue } from "@/types/ateliers";

// Dev-только (Playwright route.fulfill / ADMIN_FIXTURES=1): in-memory /api/ateliers* и /api/admin/ateliers* по Блоку 3.
// В src/app не импортируется: в production-сборку не попадает.

interface Reply {
  status: number;
  body: unknown;
}

const LABELS: Record<AtelierStatusValue, string> = { pending: "На рассмотрении", approved: "Одобрена", rejected: "Отклонена" };
const ok = (data: unknown, meta?: unknown): Reply => ({ status: 200, body: meta ? { data, meta } : { data } });
const err = (status: number, code: string, message: string, details?: unknown): Reply => ({
  status,
  body: { error: { code, message, ...(details ? { details } : {}) } },
});

const row = (n: number, p: Partial<AdminAtelierListItem>): AdminAtelierListItem => ({
  id: `00000000-0000-4000-8000-0000000a${String(n).padStart(4, "0")}`,
  company_name: "Garage 77", inn: "7801234564", city: "Санкт-Петербург", contact_name: "Илья Ветров", phone: "+79213004050",
  email: "ilya@garage77.ru", website: "https://vk.com/garage77spb",
  comment: "Ставим диски и обвесы на BMW и Audi, 15–20 машин в месяц", status: "pending", orders_count: 0,
  created_at: `2026-10-0${n}T14:20:00.000Z`, ...p,
});

function initialRows(): AdminAtelierListItem[] {
  return [
    row(1, {}),
    row(2, { company_name: "Карбон-Лаб Екатеринбург, тюнинг и доработка автомобилей", inn: "7707083893", city: "Екатеринбург", contact_name: "Анастасия Горностаева-Белоусова", email: "anastasia.gornostaeva@carbon-lab-ekaterinburg.example.ru", website: "javascript:alert(1)", comment: null }),
    row(3, { company_name: "Garage 77 (повтор)", inn: "7728168971", city: "Москва", website: null }),
    row(4, { company_name: "Aero Tuning", inn: "7710140679", city: "Казань", contact_name: "Рустам Исмаилов", email: "rustam@aero-tuning.example.ru", status: "approved", orders_count: 3, comment: null }),
    row(5, { company_name: "Drive Atelier", inn: "500100732259", city: "Краснодар", contact_name: "Марина Лисина", email: "marina@drive-atelier.example.ru", status: "approved", orders_count: 1, website: "https://drive-atelier.example.ru" }),
    row(6, { company_name: "Wheel Pro", inn: "7801234571", city: "Тверь", contact_name: "Олег Мазур", email: "oleg@wheelpro.example.ru", status: "rejected", website: null }),
  ];
}

interface State {
  rows: AdminAtelierListItem[];
  me: MyAtelier | null;
  /** Сколько ближайших GET /api/ateliers/me вернуть с 500 (Error → «Повторить»). */
  failMe: number;
  failAdminList: number;
}

let state: State = { rows: initialRows(), me: null, failMe: 0, failAdminList: 0 };

/** Сброс + статус заявки текущего пользователя: null — заявки нет. */
export function resetAtelierFixtures(opts: { me?: AtelierStatusValue | null; failMe?: number; failAdminList?: number; emptyAdmin?: boolean } = {}): void {
  state = { rows: opts.emptyAdmin ? [] : initialRows(), me: null, failMe: opts.failMe ?? 0, failAdminList: opts.failAdminList ?? 0 };
  if (opts.me) {
    state.me = {
      id: "e1c7a3b9-5d2f-4e8a-9b06-3f1d7c2e8a54", company_name: "Garage 77", inn: "7801234564", city: "Санкт-Петербург", status: opts.me,
      status_label: LABELS[opts.me], created_at: "2026-10-01T14:20:00.000Z",
      rejection_reason: opts.me === "rejected" ? "Не нашли информации об ателье. Пришлите ссылку на сайт или соцсети" : null,
    };
  }
}

function apply(body: unknown): Reply {
  const parsed = atelierApplyBody.safeParse(body);
  if (!parsed.success) {
    // Как сервер: z.flattenError(...).fieldErrors (сообщения zod по умолчанию — английские).
    return err(400, "VALIDATION_ERROR", "Проверьте поля формы", { fields: z.flattenError(parsed.error).fieldErrors });
  }
  if (state.me && state.me.status !== "rejected") return err(409, "ALREADY_APPLIED", "Заявка уже на рассмотрении");
  if (parsed.data.company_name.includes("500")) return err(500, "INTERNAL_ERROR", "Что-то пошло не так");
  const id = state.me?.id ?? "e1c7a3b9-5d2f-4e8a-9b06-3f1d7c2e8a54";
  const created = new Date().toISOString();
  state.me = { id, company_name: parsed.data.company_name, inn: parsed.data.inn, city: parsed.data.city, status: "pending", status_label: LABELS.pending, rejection_reason: null, created_at: created };
  state.rows.unshift(row(9, { id, ...parsed.data, email: "me@example.ru", created_at: created }));
  const result: AtelierApplied = { id, status: "pending", status_label: LABELS.pending };
  return { status: 201, body: { data: result } };
}

function review(id: string, body: Record<string, unknown>): Reply {
  const target = state.rows.find((r) => r.id === id);
  if (!target) return err(404, "NOT_FOUND", "Заявка не найдена");
  if (body.status === "approved") {
    if (state.rows.some((r) => r.status === "approved" && r.inn === target.inn && r.id !== id)) {
      return err(409, "CONFLICT", `Ателье с ИНН ${target.inn} уже одобрено под другим аккаунтом`);
    }
    target.status = "approved";
  } else if (body.status === "rejected") {
    const reason = typeof body.rejection_reason === "string" ? body.rejection_reason.trim() : "";
    if (reason.length < ATELIER_REJECTION_MIN || reason.length > ATELIER_REJECTION_MAX) {
      return err(400, "VALIDATION_ERROR", "Проверьте поля формы", { fields: { rejection_reason: ["Укажите причину, минимум 10 символов"] } });
    }
    target.status = "rejected";
  } else {
    return err(400, "VALIDATION_ERROR", "Проверьте поля формы");
  }
  return ok({ id, status: target.status, reviewed_at: new Date().toISOString() });
}

function adminList(params: URLSearchParams): Reply {
  if (state.failAdminList > 0) {
    state.failAdminList -= 1;
    return err(500, "INTERNAL_ERROR", "Что-то пошло не так");
  }
  const status = params.get("status");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const rows = state.rows.filter((r) => !status || r.status === status);
  return ok(rows.slice((page - 1) * 20, page * 20), { total: rows.length, page, per_page: 20 });
}

/** null — маршрут не про ателье. */
export function handleAtelierFixture(method: string, rawUrl: string, body: unknown): Reply | null {
  const url = new URL(rawUrl, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  const payload = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (parts[0] !== "api") return null;
  if (parts[1] === "ateliers") {
    if (parts[2] === "me" && method === "GET") {
      if (state.failMe > 0) {
        state.failMe -= 1;
        return err(500, "INTERNAL_ERROR", "Что-то пошло не так");
      }
      return ok(state.me);
    }
    if (!parts[2] && method === "POST") return apply(body);
  }
  if (parts[1] === "admin" && parts[2] === "ateliers") {
    if (!parts[3] && method === "GET") return adminList(url.searchParams);
    if (parts[3] && method === "PATCH") return review(parts[3], payload);
  }
  return null;
}
