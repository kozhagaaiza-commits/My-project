import type { SupabaseClient } from "@supabase/supabase-js";

// Записывающая подмена supabase-js для проверки PostgREST/Storage-запросов без сети: каждая цепочка
// from(table).select(...).eq(...) записывается как список вызовов; ответ задаёт функция respond.

export interface Recorded { table: string; calls: Array<[string, ...unknown[]]> }
export interface FakeResult { data: unknown; error: { message: string; code?: string; details?: string } | null; count?: number | null }

export function recordingClient(respond: (q: Recorded) => FakeResult = () => ({ data: [], error: null })) {
  const queries: Recorded[] = [];
  const chain = (rec: Recorded): unknown => new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") {
        return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(respond(rec)).then(ok, bad);
      }
      return (...args: unknown[]) => {
        rec.calls.push([String(prop), ...args]);
        return chain(rec);
      };
    },
  });
  const storageOp = (bucket: string, op: string) => async (...args: unknown[]) => {
    const rec: Recorded = { table: `storage:${bucket}`, calls: [[op, ...args]] };
    queries.push(rec);
    return respond(rec);
  };
  const client = {
    from(table: string) {
      const rec: Recorded = { table, calls: [] };
      queries.push(rec);
      return chain(rec);
    },
    async rpc(fn: string, args?: unknown) {
      const rec: Recorded = { table: `rpc:${fn}`, calls: [["rpc", ...(args === undefined ? [] : [args])]] };
      queries.push(rec);
      return respond(rec);
    },
    storage: {
      from: (bucket: string) => ({ upload: storageOp(bucket, "upload"), remove: storageOp(bucket, "remove"), list: storageOp(bucket, "list") }),
    },
  };
  return { queries, client: client as unknown as SupabaseClient };
}
