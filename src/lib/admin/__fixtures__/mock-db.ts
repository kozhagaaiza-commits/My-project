import type { Db } from "@/lib/catalog/db";

// Мок supabase-js для тестов слоя БД админки: записывает цепочку вызовов по таблицам и отдаёт заготовленные ответы.
// respond(table, ops) решает ответ по записанным операциям (например, head-запрос count или конкретный фильтр).

export type Op = [string, ...unknown[]];
export interface MockRes { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null }
export interface MockCall { table: string; ops: Op[] }

const CHAIN = ["select", "eq", "neq", "in", "or", "ilike", "gte", "lt", "lte", "gt", "order", "range", "limit", "maybeSingle", "single", "update", "insert", "upsert"];

export function mockDb(respond: (table: string, ops: Op[]) => MockRes) {
  const calls: MockCall[] = [];
  const make = (entry: MockCall) => {
    const b: Record<string, unknown> = {};
    for (const m of CHAIN) b[m] = (...args: unknown[]) => { entry.ops.push([m, ...args]); return b; };
    b.then = (ok: (r: unknown) => unknown, fail?: (e: unknown) => unknown) => {
      const r = respond(entry.table, entry.ops);
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null }).then(ok, fail);
    };
    return b;
  };
  const db = {
    from(table: string) {
      const entry: MockCall = { table, ops: [] };
      calls.push(entry);
      return make(entry);
    },
    rpc(fn: string, args?: unknown) {
      const entry: MockCall = { table: `rpc:${fn}`, ops: [["rpc", args]] };
      calls.push(entry);
      return make(entry);
    },
  } as unknown as Db;
  return { db, calls };
}

/** Все аргументы select(...) из записанных вызовов — для проверки «никогда *, только явные колонки». */
export const selects = (calls: MockCall[]): string[] =>
  calls.flatMap((c) => c.ops.filter((o) => o[0] === "select").map((o) => String(o[1])));
