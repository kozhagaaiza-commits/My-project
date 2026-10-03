"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/admin-ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { adminRequest, fieldErrors } from "@/lib/admin-ui/api";
import {
  ROUNDING_OPTIONS, settingsFormSchema, settingsPatchFromForm, type SettingsFormValues,
} from "@/lib/admin-ui/schemas";
import type { AdminSettings } from "@/lib/admin-ui/types";

interface PricesCardProps {
  settings: AdminSettings;
  onSaved: () => void;
}

const FIELD_NAMES = ["markup_multiplier", "price_rounding_rub", "auto_reprice", "reprice_threshold"] as const;

/** «Цены»: множитель, округление, автопересчёт, порог курса; PATCH /api/admin/settings. */
export function PricesCard({ settings, onSaved }: PricesCardProps) {
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      markup_multiplier: settings.markup_multiplier.toFixed(2),
      price_rounding_rub: String(settings.price_rounding_rub) as SettingsFormValues["price_rounding_rub"],
      auto_reprice: settings.auto_reprice,
      reprice_threshold: String(settings.reprice_threshold),
    },
  });
  const submitting = form.formState.isSubmitting;

  async function onSubmit(values: SettingsFormValues) {
    const res = await adminRequest("PATCH", "/api/admin/settings", settingsPatchFromForm(values));
    if (res.ok) {
      toast.success("Настройки сохранены");
      onSaved();
      return;
    }
    const fields = fieldErrors(res);
    const named = FIELD_NAMES.filter((n) => fields[n]);
    for (const name of named) form.setError(name, { message: fields[name] });
    if (named.length === 0) toast.error(res.message);
  }

  return (
    <Card className="gap-4 p-5">
      <h2 className="text-lg font-semibold">Цены</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <FormField
            control={form.control}
            name="markup_multiplier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Множитель наценки</FormLabel>
                <FormControl><Input {...field} inputMode="decimal" className="font-mono tabular-nums" /></FormControl>
                <FormDescription>2.00 — наценка 100%</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="price_rounding_rub"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Округление</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full font-mono"><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ROUNDING_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o} className="font-mono">{o} ₽</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="auto_reprice"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="font-normal">Пересчитывать автоматически после загрузки курса</FormLabel>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="reprice_threshold"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Порог изменения курса, %</FormLabel>
                <FormControl><Input {...field} inputMode="decimal" className="font-mono tabular-nums" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div>
            <Button type="submit" variant="outline" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" aria-hidden />}
              Сохранить
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  );
}
