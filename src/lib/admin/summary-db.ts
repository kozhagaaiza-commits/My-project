import "server-only";
import { z } from "zod";
import { rows, rpcReservedQtyMap, type Db } from "@/lib/catalog/db";
import { DbError } from "@/lib/orders/errors";
import { selectLatestRates } from "./settings-db";
import type { SummaryRepo } from "./summary";

// Репозиторий сводки /admin через service-role (5.10: админские эндпоинты; needs_attention скрыт колоночными правами 2.18) —
// ТОЛЬКО после authorizeAdminApi. Счётчики — head-запросы count=exact (строки не читаются).

interface CountResult { count: number | null; error: { message: string; code?: string } | null }

function count(scope: string, res: CountResult): number {
  if (res.error) throw new DbError(scope, res.error.code || undefined, res.error.message);
  if (typeof res.count !== "number") throw new Error(`${scope}: count missing`);
  return res.count;
}

const stockProductRow = z.object({ id: z.string(), title: z.string(), stock_qty: z.number().int() });
const totalRow = z.object({ total: z.number().int() });

export function createSummaryRepo(c: Db): SummaryRepo {
  const head = (table: string) => c.from(table).select("id", { count: "exact", head: true });
  return {
    async countOrdersByStatus(status) {
      return count("orders.summary.byStatus", await head("orders").eq("status", status));
    },
    async countOrdersNeedingAttention() {
      return count("orders.summary.attention", await head("orders").eq("needs_attention", true));
    },
    async countPreordersInStatuses(statuses) {
      return count("orders.summary.preorders", await head("orders").eq("kind", "preorder").in("status", [...statuses]));
    },
    async countAteliersPending() {
      return count("ateliers.summary.pending", await head("ateliers").eq("status", "pending"));
    },
    async listActiveStockProducts() {
      const res = await c.from("products").select("id,title,stock_qty").eq("status", "active").eq("availability_mode", "stock");
      return rows(stockProductRow, res, "products.summary.stock");
    },
    reservedQtyMap: () => rpcReservedQtyMap(c),
    async listPaidTotals(fromIso, toIso) {
      const res = await c.from("orders").select("total").gte("paid_at", fromIso).lt("paid_at", toIso);
      return rows(totalRow, res, "orders.summary.month").map((r) => r.total);
    },
    latestRates: () => selectLatestRates(c),
    async countNotificationsFailedSince(sinceIso) {
      return count("notification_queue.summary.failed", await head("notification_queue").eq("status", "failed").gte("updated_at", sinceIso));
    },
  };
}
