import Link from "next/link";
import { User } from "lucide-react";
import { CartButton } from "@/components/shop/CartButton";
import { MobileNav } from "@/components/shop/MobileNav";
import { NavLinks, type NavItem } from "@/components/shop/NavLinks";
import { VehicleBadge } from "@/components/shop/VehicleBadge";
import { Button } from "@/components/ui/button";
import { FEATURE_ATELIER, SITE_NAME } from "@/lib/config";

const NAV_ITEMS: NavItem[] = [
  { href: "/wheels", label: "Диски" },
  { href: "/carbon", label: "Карбон" },
  ...(FEATURE_ATELIER ? [{ href: "/atelier", label: "Ателье" }] : []),
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 md:gap-4 md:px-6">
        <MobileNav items={NAV_ITEMS} siteName={SITE_NAME} />
        <Link
          href="/"
          className="font-mono text-sm font-semibold tracking-widest text-foreground uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:mr-4"
        >
          {SITE_NAME}
        </Link>
        <div className="hidden md:block">
          <NavLinks items={NAV_ITEMS} />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <VehicleBadge />
          <CartButton />
          <Button asChild variant="ghost" size="icon" className="md:hidden">
            <Link href="/auth/login" aria-label="Войти">
              <User aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
            <Link href="/auth/login">
              <User aria-hidden />
              Войти
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
