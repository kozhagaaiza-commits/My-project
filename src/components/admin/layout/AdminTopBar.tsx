"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { AdminNav } from "@/components/admin/layout/AdminNav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SITE_NAME } from "@/lib/config";

interface AdminTopBarProps {
  email: string | null;
}

/** Mobile/tablet (< lg): верхняя панель с кнопкой Menu, sidebar открывается в Sheet слева (Чертёж, 4.1). */
export function AdminTopBar({ email }: AdminTopBarProps) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Открыть меню">
            <Menu aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle className="font-mono tracking-widest uppercase">{SITE_NAME}</SheetTitle>
            <SheetDescription className="sr-only">Разделы админки</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-6 px-4 pb-4">
            <AdminNav onNavigate={() => setOpen(false)} />
            <div className="mt-auto flex flex-col gap-1 text-xs text-muted-foreground">
              {email && <span className="truncate">{email}</span>}
              <Link href="/" className="text-silver underline-offset-4 hover:underline">
                На сайт
              </Link>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <span className="font-mono text-sm tracking-widest uppercase">{SITE_NAME}</span>
      <span className="text-xs text-muted-foreground">Админка</span>
    </header>
  );
}
