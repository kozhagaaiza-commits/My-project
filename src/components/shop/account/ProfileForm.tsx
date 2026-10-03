"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthField } from "@/components/shop/auth/AuthField";
import { AuthFormError } from "@/components/shop/auth/AuthFormError";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { applyPhoneMask } from "@/lib/checkout-mask";
import { profileBody, type ProfileValues } from "@/lib/schemas/auth";
import { createClient } from "@/lib/supabase/browser";

interface ProfileFormProps {
  userId: string;
  fullName: string;
  /** Телефон в формате +7XXXXXXXXXX или null. */
  phone: string | null;
  fixtures: boolean;
}

/** «+79165551234» → «+7 (916) 555-12-34» для поля с маской. */
const phoneForField = (phone: string | null): string => (phone ? applyPhoneMask(phone) : "");

/** Профиль: имя, телефон; обновление через сессионный клиент Supabase — только колонки full_name, phone (2.1). */
export function ProfileForm({ userId, fullName, phone, fixtures }: ProfileFormProps) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const defaults = useMemo<ProfileValues>(() => ({ full_name: fullName, phone: phoneForField(phone) }), [fullName, phone]);
  const form = useForm<ProfileValues>({ resolver: zodResolver(profileBody), defaultValues: defaults });
  const { isSubmitting } = form.formState;

  async function onSubmit(values: ProfileValues) {
    setFailed(false);
    const parsed = profileBody.parse(values);
    const phoneValue = parsed.phone === "" ? null : parsed.phone;
    try {
      if (fixtures) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        const { error } = await createClient().from("profiles").update({ full_name: parsed.full_name, phone: phoneValue }).eq("id", userId);
        if (error) throw error;
      }
    } catch {
      setFailed(true);
      return;
    }
    form.reset({ full_name: parsed.full_name, phone: phoneForField(phoneValue) });
    toast.success("Профиль сохранён");
    router.refresh();
  }

  return (
    <section aria-labelledby="profile-title" className="flex flex-col gap-4">
      <h2 id="profile-title" className="text-lg font-semibold">Профиль</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex max-w-sm flex-col gap-4">
          <AuthField control={form.control} name="full_name" label="Имя" autoComplete="name" />
          <AuthField
            control={form.control}
            name="phone"
            label="Телефон"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+7 (999) 999-99-99"
            transform={applyPhoneMask}
          />
          {failed && <AuthFormError>Не удалось сохранить. Повторите попытку</AuthFormError>}
          <Button type="submit" variant="outline" className="self-start" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
            Сохранить
          </Button>
        </form>
      </Form>
    </section>
  );
}
