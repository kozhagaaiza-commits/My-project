"use client";

import { Loader2 } from "lucide-react";
import { AuthField } from "@/components/shop/auth/AuthField";
import { AuthFormError } from "@/components/shop/auth/AuthFormError";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useAtelierApply } from "@/hooks/use-atelier-apply";
import { applyPhoneMask } from "@/lib/checkout-mask";
import type { AtelierFormValues } from "@/lib/atelier-ui/form";
import type { AtelierApplied } from "@/types/ateliers";

interface AtelierApplyFormProps {
  initial: AtelierFormValues;
  /** Повторная подача после отказа: меняется текст кнопки. */
  resubmit: boolean;
  onApplied: (result: AtelierApplied) => void;
  onAlreadyApplied: () => void;
}

/** Форма заявки ателье (Блок 4 «Для ателье»): 7 полей, единственная жёлтая кнопка экрана. */
export function AtelierApplyForm({ initial, resubmit, onApplied, onAlreadyApplied }: AtelierApplyFormProps) {
  const { form, onSubmit, failed, submitting } = useAtelierApply({ initial, onApplied, onAlreadyApplied });
  const c = form.control;
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-label="Заявка ателье">
        <AuthField control={c} name="company_name" label="Название" autoComplete="organization" maxLength={120} />
        <AuthField control={c} name="inn" label="ИНН" inputMode="numeric" autoComplete="off" maxLength={12}
          transform={(raw) => raw.replace(/\D/g, "").slice(0, 12)} description="10 или 12 цифр" />
        <AuthField control={c} name="city" label="Город" autoComplete="address-level2" maxLength={80} />
        <AuthField control={c} name="contact_name" label="Контактное лицо" autoComplete="name" maxLength={100} />
        <AuthField control={c} name="phone" label="Телефон" type="tel" inputMode="tel" autoComplete="tel"
          placeholder="+7 (999) 999-99-99" transform={applyPhoneMask} />
        <AuthField control={c} name="website" label="Сайт или соцсети" type="url" inputMode="url" autoComplete="url"
          maxLength={200} placeholder="https://vk.com/garage77" description="Необязательно" />
        <FormField
          control={c}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Комментарий</FormLabel>
              <FormControl>
                <Textarea {...field} rows={4} maxLength={1000} className="scroll-my-24" />
              </FormControl>
              <FormDescription>Необязательно</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {failed && <AuthFormError>Не удалось отправить заявку. Повторите</AuthFormError>}
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto sm:self-start">
          {submitting && <Loader2 className="animate-spin" aria-hidden />}
          {resubmit ? "Подать повторно" : "Отправить заявку"}
        </Button>
      </form>
    </Form>
  );
}
