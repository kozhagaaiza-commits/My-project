"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

interface NavLinksProps {
  items: NavItem[];
  orientation?: "horizontal" | "vertical";
  onNavigate?: () => void;
}

export function NavLinks({ items, orientation = "horizontal", onNavigate }: NavLinksProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Основная навигация">
      <ul className={cn("flex gap-1", orientation === "vertical" ? "flex-col" : "items-center")}>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active ? "text-foreground" : "text-silver",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
