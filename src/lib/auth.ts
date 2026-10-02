import { createClient } from "@/lib/supabase/server";

export async function getSessionContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null, atelierId: null } as const;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  let atelierId: string | null = null;
  if (profile?.role === "atelier") {
    const { data: a } = await supabase.from("ateliers").select("id,status").eq("user_id", user.id).single();
    atelierId = a?.status === "approved" ? a.id : null;
  }
  return { supabase, user, role: profile?.role ?? "customer", atelierId } as const;
}

// В начале каждого /api/admin/*:
// const ctx = await getSessionContext();
// if (!ctx.user) return apiError("UNAUTHORIZED", "Войдите в аккаунт", 401);
// if (ctx.role !== "admin") return apiError("FORBIDDEN", "Недостаточно прав", 403);
