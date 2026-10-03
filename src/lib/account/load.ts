import "server-only";
import { FEATURE_ATELIER } from "@/lib/config";
import { getSessionContext } from "@/lib/auth";
import { listAccountOrders } from "@/lib/account/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AccountOrdersPage } from "@/types/account";

// Данные страницы /account. Пользователь — auth.getUser(); профиль и заявка ателье читаются сессионным клиентом
// (RLS: только своя строка); заказы — service-role строго по user.id из сессии (CLAUDE.md, колоночные права 2.18).

export interface AccountData {
  user: { id: string; email: string | null };
  fullName: string;
  phone: string | null;
  /** null — заявки нет или ателье выключено/недоступно. */
  atelierStatus: string | null;
  /** null — не удалось загрузить заказы (Error). */
  orders: AccountOrdersPage | null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** null — гость (страница перенаправляет на вход). */
export async function loadAccount(page: number): Promise<AccountData | null> {
  const ctx = await getSessionContext();
  if (!ctx.user) return null;
  const { supabase, user } = ctx;

  let fullName = "";
  let phone: string | null = null;
  const profile = await supabase.from("profiles").select("full_name,phone").eq("id", user.id).maybeSingle();
  if (profile.error) throw new Error(`account.profile: ${profile.error.code ?? ""} ${profile.error.message}`);
  fullName = str(profile.data?.full_name) ?? "";
  phone = str(profile.data?.phone);

  let atelierStatus: string | null = null;
  if (FEATURE_ATELIER) {
    // Статус заявки — второстепенный блок: сбой не должен ронять кабинет.
    const atelier = await supabase.from("ateliers").select("status").eq("user_id", user.id).maybeSingle();
    if (atelier.error) console.error({ scope: "account.atelier", code: atelier.error.code });
    else atelierStatus = str(atelier.data?.status);
  }

  let orders: AccountOrdersPage | null = null;
  try {
    orders = await listAccountOrders(createAdminClient(), user.id, page);
  } catch (err) {
    console.error({ scope: "account.orders", err });
  }
  return { user: { id: user.id, email: user.email ?? null }, fullName, phone, atelierStatus, orders };
}
