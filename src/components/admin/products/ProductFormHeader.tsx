import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PRODUCT_STATUS_LABELS } from "@/lib/admin-products-ui/labels";
import type { AdminProductStatus } from "@/lib/admin-products-ui/types";

interface ProductFormHeaderProps {
  title: string;
  status: AdminProductStatus | null;
}

export function ProductFormHeader({ title, status }: ProductFormHeaderProps) {
  return (
    <header className="space-y-2">
      <Link href="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Товары
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold break-words">{title}</h1>
        {status && <Badge variant="outline">{PRODUCT_STATUS_LABELS[status]}</Badge>}
      </div>
    </header>
  );
}
