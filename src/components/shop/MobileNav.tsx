"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { NavLinks, type NavItem } from "@/components/shop/NavLinks";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MobileNav({ items, siteName }: { items: NavItem[]; siteName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Открыть меню">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle className="font-mono tracking-widest uppercase">{siteName}</SheetTitle>
          <SheetDescription className="sr-only">Разделы сайта</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <NavLinks items={items} orientation="vertical" onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
