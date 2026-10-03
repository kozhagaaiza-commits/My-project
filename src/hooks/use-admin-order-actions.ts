"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/admin-ui/toast";
import { adminRequest, type ApiFailure, type ApiResult } from "@/lib/admin-ui/api";
import type {
  AdminMetaPatchResult, AdminOrderDetail, AdminRefundResult, AdminStatusChangeResult, OrderStatus,
} from "@/lib/admin-ui/types";

export interface StatusChangeInput {
  to_status: OrderStatus;
  tracking_number?: string | null;
  courier_note?: string | null;
  note?: string | null;
}

export interface MetaPatchInput {
  expected_ready_at?: string | null;
  customer_visible_note?: string | null;
  admin_note?: string | null;
  tracking_number?: string | null;
  courier_note?: string | null;
  needs_attention?: boolean;
}

export interface RefundInput {
  amount: number;
  reason: string;
  restock: boolean;
}

interface CallOptions {
  /** Коды ошибок, которые вызывающий показывает inline — без toast. */
  inline?: readonly string[];
  success?: string;
  /** Таймаут запроса, мс (возврат ждёт ответа ЮKassa). */
  timeoutMs?: number;
}

/**
 * Действия на странице заказа (US-007, US-008). Запросы идут по очереди — `updated_at` для оптимистичной
 * блокировки берётся из последнего ответа. После успеха — повторный GET; CONFLICT → toast + перезагрузка.
 */
export function useAdminOrderActions(order: AdminOrderDetail, reload: () => void) {
  const [pending, setPending] = useState(0);
  const stamp = useRef(order.updated_at);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    stamp.current = order.updated_at;
  }, [order.updated_at]);

  const call = useCallback(
    <T extends { updated_at?: string }>(
      method: "PATCH" | "POST",
      path: string,
      body: (updatedAt: string) => unknown,
      options: CallOptions = {},
    ): Promise<ApiResult<T>> => {
      const task = chain.current.then(async (): Promise<ApiResult<T>> => {
        setPending((n) => n + 1);
        try {
          const res = await adminRequest<T>(method, `/api/admin/orders/${order.id}${path}`, body(stamp.current), options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined);
          if (res.ok) {
            if (res.data.updated_at) stamp.current = res.data.updated_at;
            if (options.success) toast.success(options.success);
            reload();
          } else if (res.code === "CONFLICT" || res.code === "TIMEOUT") {
            toast.error(res.message);
            reload();
          } else if (!options.inline?.includes(res.code)) {
            toast.error(res.message);
          }
          return res;
        } finally {
          setPending((n) => n - 1);
        }
      });
      chain.current = task.catch(() => undefined);
      return task;
    },
    [order.id, reload],
  );

  const changeStatus = useCallback(
    (input: StatusChangeInput, options?: CallOptions) =>
      call<AdminStatusChangeResult>(
        "PATCH",
        "/status",
        (updated_at) => ({ tracking_number: null, courier_note: null, note: null, ...input, updated_at }),
        options,
      ),
    [call],
  );

  const patchMeta = useCallback(
    (input: MetaPatchInput, options?: CallOptions) =>
      call<AdminMetaPatchResult>("PATCH", "", (updated_at) => ({ ...input, updated_at }), options),
    [call],
  );

  const refund = useCallback(
    (input: RefundInput, options?: CallOptions) =>
      call<AdminRefundResult & { updated_at?: string }>("POST", "/refund", () => input, { timeoutMs: 65_000, ...options }),
    [call],
  );

  return { busy: pending > 0, changeStatus, patchMeta, refund };
}

export type OrderActions = ReturnType<typeof useAdminOrderActions>;
export type { ApiFailure };
