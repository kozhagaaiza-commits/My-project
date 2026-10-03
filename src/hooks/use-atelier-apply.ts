"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { reachGoal } from "@/lib/analytics";
import { submitAtelierApplication } from "@/lib/atelier-ui/api";
import {
  ATELIER_FIELDS, atelierResolver, parseApplyPayload, type AtelierFormValues,
} from "@/lib/atelier-ui/form";
import type { AtelierApplied } from "@/types/ateliers";

interface Options {
  initial: AtelierFormValues;
  onApplied: (result: AtelierApplied) => void;
  /** ALREADY_APPLIED: статус на сервере уже изменился — перезагрузить его. */
  onAlreadyApplied: () => void;
}

/** Отправка заявки: клиентская проверка atelierApplyBody, серверные details.fields по полям, цель Метрики. */
export function useAtelierApply({ initial, onApplied, onAlreadyApplied }: Options) {
  const form = useForm<AtelierFormValues>({ resolver: atelierResolver, defaultValues: initial });
  const [failed, setFailed] = useState(false);

  const onSubmit = form.handleSubmit(async (values) => {
    setFailed(false);
    const payload = parseApplyPayload(values);
    if (!payload) return;
    const res = await submitAtelierApplication(payload);
    if (res.ok) {
      reachGoal("atelier_applied");
      toast.success("Заявка отправлена");
      onApplied(res.data);
      return;
    }
    if (res.code === "ALREADY_APPLIED") {
      toast.error(res.message || "Заявка уже на рассмотрении");
      onAlreadyApplied();
      return;
    }
    const first = ATELIER_FIELDS.find((name) => res.fields[name]);
    if (res.code === "VALIDATION_ERROR" && first) {
      ATELIER_FIELDS.forEach((name) => {
        if (res.fields[name]) form.setError(name, { type: "server", message: res.fields[name] }, { shouldFocus: name === first });
      });
      return;
    }
    setFailed(true);
    toast.error("Не удалось отправить заявку. Повторите");
  });

  return { form, onSubmit, failed, submitting: form.formState.isSubmitting };
}
