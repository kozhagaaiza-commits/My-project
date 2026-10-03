import { FEATURE_ATELIER } from "@/lib/config";

export type AdminNavIcon = "LayoutDashboard" | "Package" | "Disc3" | "Car" | "Building2" | "Settings";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: AdminNavIcon;
}

// Блок 4.1 (Admin layout). «Ателье» — только при FEATURE_ATELIER (флаг проекта: src/lib/config.ts).
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin", label: "Сводка", icon: "LayoutDashboard" },
  { href: "/admin/orders", label: "Заказы", icon: "Package" },
  { href: "/admin/products", label: "Товары", icon: "Disc3" },
  { href: "/admin/vehicles", label: "Автомобили", icon: "Car" },
  ...(FEATURE_ATELIER ? [{ href: "/admin/ateliers", label: "Ателье", icon: "Building2" } as const] : []),
  { href: "/admin/settings", label: "Настройки", icon: "Settings" },
];

/** Сводка активна только на точном /admin, остальные — по префиксу. */
export function isNavActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}
