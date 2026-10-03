"use client";

import { useCallback } from "react";
import { useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { adminRequest, errorText } from "@/lib/admin-products-ui/api";
import type { VehicleUpsertBody } from "@/lib/admin-products-ui/schemas";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";
import {
  duplicateText, EMPTY_VEHICLE_VALUES, makeVehicleResolver, vehicleValuesFromRow, type VehicleFormValues,
} from "@/lib/admin-products-ui/vehicle-form";

export type VehicleForm = UseFormReturn<VehicleFormValues, unknown, VehicleUpsertBody>;

interface Options {
  /** null — создание. */
  vehicle: AdminVehicleRow | null;
  /** Вызывается после успешного сохранения и после 404 (запись исчезла) — закрыть Sheet и обновить список. */
  onDone: () => void;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Форма автомобиля: POST / PATCH, дубликат (409) → toast, ошибки полей сервера → inline. */
export function useAdminVehicleForm({ vehicle, onDone }: Options) {
  const form: VehicleForm = useForm<VehicleFormValues, unknown, VehicleUpsertBody>({
    defaultValues: vehicle ? vehicleValuesFromRow(vehicle) : EMPTY_VEHICLE_VALUES,
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
    resolver: makeVehicleResolver(),
  });

  const submit = useCallback(
    () =>
      form.handleSubmit(async (body) => {
        const r = vehicle
          ? await adminRequest<{ fitting_products_count?: number }>("PATCH", `/api/admin/vehicles/${vehicle.id}`, body)
          : await adminRequest<{ fitting_products_count?: number }>("POST", "/api/admin/vehicles", body);
        if (r.ok) {
          const count = isRecord(r.data) && typeof r.data.fitting_products_count === "number" ? r.data.fitting_products_count : null;
          toast.success(count === null ? "Сохранено" : `Сохранено. Подходящих дисков: ${count}`);
          return onDone();
        }
        if (r.kind === "network") return void toast.error(errorText(r));
        if (r.status === 409) return void toast.error(duplicateText(body));
        if (r.status === 404) {
          toast.error(r.message);
          return onDone();
        }
        const fields = isRecord(r.details) && isRecord(r.details.fields) ? r.details.fields : null;
        const entries = Object.entries(fields ?? {}).filter((e): e is [string, string[]] => Array.isArray(e[1]) && typeof e[1][0] === "string");
        if (r.code === "VALIDATION_ERROR" && entries.length > 0) {
          entries.forEach(([name, msgs]) => form.setError(name as FieldPath<VehicleFormValues>, { type: "server", message: msgs[0] }));
          return form.setFocus(entries[0][0] as FieldPath<VehicleFormValues>);
        }
        toast.error(r.message);
      })(),
    [form, onDone, vehicle],
  );

  return { form, submit };
}
