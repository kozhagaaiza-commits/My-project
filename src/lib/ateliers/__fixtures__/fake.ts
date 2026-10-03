import { DbError } from "@/lib/orders/errors";
import type { AdminAtelier, AdminAteliersRepo, AtelierSession } from "@/lib/ateliers/types";

// In-memory подмена ateliers + profiles.role для тестов обработчиков ателье (без Supabase).
// Повторяет ограничения схемы 2.2: уникальный user_id, uq_ateliers_inn_approved, RLS-условия повторной подачи.

export const USER = "3f6b1c2d-8e4a-4b7c-9d1e-2a5f7c9e1b30";
export const OTHER_USER = "7a2c4e6f-1b3d-4f5a-8c7e-9d0b2a4c6e81";
export const AT_ID = "e1c7a3b9-5d2f-4e8a-9b06-3f1d7c2e8a54";
export const OTHER_AT = "b2d4f6a8-0c1e-4a3b-8d5f-7e9a1c3b5d70";
/** Валидный ИНН (контрольная сумма ФНС). Пример Чертежа 7801234567 контрольную сумму не проходит. */
export const INN = "7707083893";

export const atelier = (over: Partial<AdminAtelier> = {}): AdminAtelier => ({
  id: AT_ID, user_id: USER, company_name: "Garage 77", inn: INN, city: "Санкт-Петербург", contact_name: "Илья Ветров",
  phone: "+79213004050", website: "https://vk.com/garage77spb", comment: "Ставим диски и обвесы на BMW и Audi, 15–20 машин в месяц",
  status: "pending", rejection_reason: null, reviewed_at: null, created_at: "2026-10-01T14:20:00+00:00", ...over,
});

export class FakeAteliers {
  rows = new Map<string, AdminAtelier>();
  roles = new Map<string, string>([[USER, "customer"], [OTHER_USER, "customer"]]);
  emails = new Map<string, string>([[USER, "ilya@garage77.ru"]]);
  orders = new Map<string, number>();
  calls: string[] = [];
  /** Подмены сбоев: имя метода → ошибка. */
  fail: Record<string, Error> = {};
  /** Перед updateReview кто-то меняет статус (гонка вкладок). */
  raceStatus: AdminAtelier["status"] | null = null;
  nextId = AT_ID;

  constructor(...rows: AdminAtelier[]) {
    for (const r of rows) this.rows.set(r.id, { ...r });
  }

  private hit(name: string) {
    this.calls.push(name);
    if (this.fail[name]) throw this.fail[name];
  }

  ownOf(userId: string) {
    return [...this.rows.values()].find((r) => r.user_id === userId) ?? null;
  }

  session(userId: string = USER): AtelierSession {
    return {
      userId,
      repo: {
        find: async () => {
          this.hit("find");
          const r = this.ownOf(userId);
          return r && { id: r.id, company_name: r.company_name, inn: r.inn, city: r.city, status: r.status, rejection_reason: r.rejection_reason, created_at: r.created_at };
        },
        insert: async (b) => {
          this.hit("insert");
          if (this.ownOf(userId)) throw new DbError("ateliers.insert", "23505", "duplicate key value violates unique constraint");
          const row = atelier({ ...b, id: this.nextId, user_id: userId, status: "pending", created_at: "2026-10-03T10:00:00+00:00" });
          this.rows.set(row.id, row);
          return row.id;
        },
        resubmit: async (id, b) => {
          this.hit("resubmit");
          const r = this.rows.get(id);
          if (!r || r.user_id !== userId || r.status !== "rejected") return null;
          Object.assign(r, b, { status: "pending", rejection_reason: null, reviewed_at: null });
          return id;
        },
      },
    };
  }

  admin(): AdminAteliersRepo {
    return {
      list: async (q) => {
        this.hit("list");
        const all = [...this.rows.values()].filter((r) => !q.status || r.status === q.status)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return { rows: all.slice((q.page - 1) * 20, q.page * 20), total: all.length };
      },
      countOrders: async (id) => { this.hit("countOrders"); return this.orders.get(id) ?? 0; },
      userEmail: async (userId) => { this.hit("userEmail"); return this.emails.get(userId) ?? null; },
      byId: async (id) => { this.hit("byId"); const r = this.rows.get(id); return r ? { ...r } : null; },
      existsOtherApprovedInn: async (inn, exceptId) => {
        this.hit("existsOtherApprovedInn");
        return [...this.rows.values()].some((r) => r.inn === inn && r.status === "approved" && r.id !== exceptId);
      },
      updateReview: async (id, prev, patch) => {
        this.hit("updateReview");
        const r = this.rows.get(id);
        if (r && this.raceStatus) r.status = this.raceStatus;
        if (!r || r.status !== prev) return null;
        if (patch.status === "approved" && [...this.rows.values()].some((o) => o.inn === r.inn && o.status === "approved" && o.id !== id)) {
          throw new DbError("ateliers.admin.review", "23505", "uq_ateliers_inn_approved");
        }
        Object.assign(r, patch);
        return { id, status: r.status, reviewed_at: patch.reviewed_at };
      },
      setRole: async (userId, role, fromRoles) => {
        this.hit(`setRole:${role}`);
        const cur = this.roles.get(userId);
        if (cur === undefined || !fromRoles.includes(cur)) return 0;
        this.roles.set(userId, role);
        return 1;
      },
    };
  }
}
