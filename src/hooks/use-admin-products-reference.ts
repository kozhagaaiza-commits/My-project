"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { adminRequest, errorText } from "@/lib/admin-products-ui/api";
import type { AdminSettings, AdminVehicleRow } from "@/lib/admin-products-ui/types";

const MAX_PAGES = 25;

interface VehiclesState {
  attempt: number;
  vehicles: AdminVehicleRow[] | null; // null — ошибка
}

/**
 * Весь справочник автомобилей для формы товара («Подходит для…», совместимость карбона).
 * GET /api/admin/vehicles отдаёт по 20 на страницу — страницы забираются последовательно.
 */
export function useAdminVehicleReference() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<VehiclesState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const all: AdminVehicleRow[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const r = await adminRequest<AdminVehicleRow[]>("GET", `/api/admin/vehicles?page=${page}`, undefined, controller.signal);
        if (!r.ok) return setState({ attempt, vehicles: null });
        all.push(...r.data);
        if (!r.meta || page * r.meta.per_page >= r.meta.total || r.data.length === 0) break;
      }
      setState({ attempt, vehicles: all });
    })().catch(() => undefined); // AbortError
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (state?.attempt !== attempt) return { status: "loading" as const, vehicles: [] as AdminVehicleRow[], reload };
  if (state.vehicles === null) return { status: "error" as const, vehicles: [] as AdminVehicleRow[], reload };
  return { status: "ready" as const, vehicles: state.vehicles, reload };
}

interface SettingsState {
  attempt: number;
  settings: AdminSettings | null; // null — ошибка
}

/**
 * Настройки цен и курсы (GET /api/admin/settings) + «Загрузить курс сейчас» (POST exchange-rates/refresh).
 * Статус «loading» только до первого ответа: повторная загрузка (после refresh) не сбрасывает форму товара.
 * При ошибке settings = null — форма работает, расчёт показывает «Курс … не загружен».
 */
export function useAdminPriceSettings() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SettingsState | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    adminRequest<AdminSettings>("GET", "/api/admin/settings", undefined, controller.signal)
      .then((r) => setState((prev) => ({ attempt, settings: r.ok ? r.data : (prev?.settings ?? null) })))
      .catch(() => undefined); // AbortError
    return () => controller.abort();
  }, [attempt]);

  const refreshRates = useCallback(async (): Promise<boolean> => {
    setRefreshing(true);
    const r = await adminRequest("POST", "/api/admin/exchange-rates/refresh", {});
    setRefreshing(false);
    if (!r.ok) {
      toast.error(errorText(r));
      return false;
    }
    toast.success("Курс загружен");
    setAttempt((n) => n + 1);
    return true;
  }, []);

  return { settings: state?.settings ?? null, status: state === null ? ("loading" as const) : ("ready" as const), refreshing, refreshRates };
}
