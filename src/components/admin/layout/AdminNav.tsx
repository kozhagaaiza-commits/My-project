"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Car, Disc3, LayoutDashboard, Package, Settings, type LucideIcon } from "lucide-react";
import { ADMIN_NAV, isNavActive, type AdminNavIcon } from "@/lib/admin-ui/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<AdminNavIcon, LucideIcon> = { LayoutDashboard, Package, Disc3, Car, Building2, Settings };

interface AdminNavProps {
  onNavigate?: () => void;
}

export function AdminNav({ onNavigate }: AdminNavProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы админки">
      <ul className="flex flex-col gap-1">
        {ADMIN_NAV.map(({ href, label, icon }) => {
          const Icon = ICONS[icon];
          const active = isNavActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "bg-muted text-foreground" : "text-silver hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
