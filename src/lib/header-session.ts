import "server-only";
import { cache } from "react";
import { getSessionContext } from "@/lib/auth";

/**
 * Признак входа для шапки (только boolean — ни id, ни email в клиентские компоненты не уходят).
 * Сбой проверки сессии или отсутствие Supabase (fixtures-режимы) → гость.
 */
export const isSignedIn = cache(async (): Promise<boolean> => {
  try {
    const ctx = await getSessionContext();
    return ctx.user !== null;
  } catch {
    return false;
  }
});
