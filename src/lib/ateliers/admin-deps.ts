import "server-only";
import {
  countAtelierOrders, existsOtherApprovedInn, selectAdminAteliers, selectAtelierById, selectUserEmail, updateAtelierReview,
  updateProfileRole,
} from "@/lib/ateliers/db";
import type { AdminAteliersRepo } from "@/lib/ateliers/types";
import { createAdminClient } from "@/lib/supabase/admin";

// Реальный репозиторий админки ателье: service-role (Блок 3 «Логика (service-role)»; 5.10 — смена роли при одобрении,
// админские эндпоинты). Создаётся ТОЛЬКО после authorizeAdminApi (обработчики вызывают repo() после проверки роли).

export function createAdminAteliersRepo(): AdminAteliersRepo {
  const db = createAdminClient();
  return {
    list: (q) => selectAdminAteliers(db, q),
    countOrders: (id) => countAtelierOrders(db, id),
    userEmail: (userId) => selectUserEmail(db, userId),
    byId: (id) => selectAtelierById(db, id),
    existsOtherApprovedInn: (inn, exceptId) => existsOtherApprovedInn(db, inn, exceptId),
    updateReview: (id, prev, patch) => updateAtelierReview(db, id, prev, patch),
    setRole: (userId, role, fromRoles) => updateProfileRole(db, userId, role, fromRoles),
  };
}
