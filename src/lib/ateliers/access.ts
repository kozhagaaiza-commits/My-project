// BR-10: цены ателье — только при profiles.role = 'atelier' И ateliers.status = 'approved' (Блок 3.0, getSessionContext).
// Чистая функция — правило проверяется тестами без Supabase. Роль без одобренной заявки (частичный сбой PATCH
// /api/admin/ateliers/[id]) и одобренная заявка без роли цен не дают.

export function approvedAtelierId(
  role: string | null | undefined, atelier: { id: string; status: string } | null | undefined,
): string | null {
  if (role !== "atelier" || !atelier) return null;
  return atelier.status === "approved" ? atelier.id : null;
}
