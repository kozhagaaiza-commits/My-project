import type { Construction, SeatType } from "@/types/catalog";
import type { AdminProductStatus } from "@/lib/admin-products-ui/types";

export const PRODUCT_STATUS_LABELS: Record<AdminProductStatus, string> = {
  draft: "Черновик",
  active: "Опубликован",
  archived: "В архиве",
};

export const PCD_PRESETS = ["5x112", "5x120", "5x130", "5x108", "5x114.3"] as const;
export const PCD_OTHER = "other";

export const DIAMETERS = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24] as const;
export const SEAT_TYPES: readonly SeatType[] = ["cone60", "ball_r13", "ball_r14", "flat"];
export const CONSTRUCTIONS: readonly Construction[] = ["cast", "flow_formed", "forged_monoblock", "forged_2pc", "forged_3pc"];
export const CERTIFICATIONS = ["TÜV", "JWL", "VIA", "KBA"] as const;
export const CURRENCIES = ["USD", "CNY", "RUB"] as const;
export const MAKES = ["Audi", "BMW", "Mercedes-Benz"] as const;

export const PRODUCT_TYPE_LABELS = { wheel_set: "Комплект дисков", carbon_part: "Карбоновая деталь" } as const;
