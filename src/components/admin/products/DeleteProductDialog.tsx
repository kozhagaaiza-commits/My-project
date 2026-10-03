"use client";

import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { shortTitle } from "@/lib/admin-products-ui/table-format";
import type { AdminProductRow } from "@/lib/admin-products-ui/types";

interface DeleteProductDialogProps {
  product: AdminProductRow | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (p: AdminProductRow) => void;
}

/** «Удалить «Кованый моноблок M-01…»? Фото тоже удалятся» → DELETE. */
export function DeleteProductDialog({ product, busy, onCancel, onConfirm }: DeleteProductDialogProps) {
  return (
    <AlertDialog open={product !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить «{product ? shortTitle(product.title) : ""}»?</AlertDialogTitle>
          <AlertDialogDescription>Фото тоже удалятся</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              if (product) onConfirm(product);
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
