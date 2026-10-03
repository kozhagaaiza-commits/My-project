import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SITE_NAME } from "@/lib/config";

// Auth layout (Блок 4.1): центрированная Card max-w-sm, логотип сверху, ссылка «На главную».
// На mobile — без рамки карточки. Страницы с сессией и одноразовыми ссылками не индексируются.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: LayoutProps<"/auth">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <Link
        href="/"
        className="font-mono text-sm font-semibold tracking-widest text-foreground uppercase max-md:inline-flex max-md:min-h-11 max-md:items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {SITE_NAME}
      </Link>
      <main id="main" className="w-full max-w-sm">
        <Card className="max-md:border-0 max-md:bg-transparent max-md:shadow-none">
          <CardContent className="max-md:px-0">{children}</CardContent>
        </Card>
      </main>
      <Link
        href="/"
        className="inline-flex max-md:min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden />
        На главную
      </Link>
    </div>
  );
}
