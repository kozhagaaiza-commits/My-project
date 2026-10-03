import "server-only";
import { getSessionContext } from "@/lib/auth";
import { insertAtelier, resubmitAtelier, selectOwnAtelier } from "@/lib/ateliers/db";
import type { AtelierSession } from "@/lib/ateliers/types";

// Реальная сессия для GET /api/ateliers/me и POST /api/ateliers: пользователь — auth.getUser() (через getSessionContext),
// все запросы к ateliers — СЕССИОННЫМ клиентом (RLS проверяет владельца повторно), user_id — только из сессии.

export async function getAtelierSession(): Promise<AtelierSession | null> {
  const { supabase, user } = await getSessionContext();
  if (!user) return null;
  return {
    userId: user.id,
    repo: {
      find: () => selectOwnAtelier(supabase, user.id),
      insert: (body) => insertAtelier(supabase, user.id, body),
      resubmit: (id, body) => resubmitAtelier(supabase, id, user.id, body),
    },
  };
}
