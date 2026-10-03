"use client";

import Link from "next/link";
import { Archive, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdminProductRow } from "@/lib/admin-products-ui/types";

interface ProductRowMenuProps {
  product: AdminProductRow;
  disabled: boolean;
  onArchive: (p: AdminProductRow) => void;
  onDelete: (p: AdminProductRow) => void;
}

/** Меню действий строки: Редактировать, Открыть на сайте, В архив, Удалить. */
export function ProductRowMenu({ product, disabled, onArchive, onDelete }: ProductRowMenuProps) {
  // На сайте виден только опубликованный товар; slug в списке приходит не всегда (см. types.ts).
  const siteHref = product.status === "active" && product.slug ? `/product/${product.slug}` : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" disabled={disabled} aria-label={`Действия: ${product.title}`}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/admin/products/${product.id}`}>
            <Pencil aria-hidden />
            Редактировать
          </Link>
        </DropdownMenuItem>
        {siteHref ? (
          <DropdownMenuItem asChild>
            <a href={siteHref} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
              Открыть на сайте
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <ExternalLink aria-hidden />
            Открыть на сайте
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={product.status === "archived"} onSelect={() => onArchive(product)}>
          <Archive aria-hidden />
          В архив
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(product)}>
          <Trash2 aria-hidden />
          Удалить
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
