"use client";

import { useRouter } from "next/navigation";
import { Loader2, ShoppingBag } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { setCartSheetOpen } from "@/hooks/use-cart-sheet";
import { useAddToCart, type AddToCartProduct } from "@/hooks/use-add-to-cart";

interface AddToCartProps {
  product: AddToCartProduct;
  quantity: number;
  soldOut: boolean;
  onSoldOut: () => void;
  /** «BMW 5 Series G30» — для диалога «не подходит». */
  vehicleName: string | null;
  className?: string;
}

/** Единственная жёлтая кнопка экрана товара + диалоги несовместимости и смены корзины. */
export function AddToCart({ product, quantity, soldOut, onSoldOut, vehicleName, className }: AddToCartProps) {
  const router = useRouter();
  const add = useAddToCart(product, { onSoldOut });
  const subject = product.type === "wheel_set" ? "Этот диск" : "Эта деталь";

  return (
    <>
      <Button
        type="button"
        size="lg"
        className={className}
        disabled={soldOut || add.busy}
        onClick={() => add.request(quantity)}
      >
        {add.busy ? <Loader2 className="animate-spin" aria-hidden /> : <ShoppingBag aria-hidden />}
        {soldOut ? "Нет в наличии" : "В корзину"}
      </Button>

      <AlertDialog open={add.dialog === "misfit"} onOpenChange={(open) => !open && add.closeDialog("misfit")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {subject} не подходит к {vehicleName ?? "выбранному авто"}. Всё равно добавить?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Параметры не совпадают с параметрами выбранного автомобиля.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={add.confirmMisfit}>Всё равно добавить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={add.dialog === "mixed"} onOpenChange={(open) => !open && add.closeDialog("mixed")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Детали под заказ и диски из наличия оформляются разными заказами</AlertDialogTitle>
            <AlertDialogDescription>
              В корзине уже есть товары другого типа.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction variant="outline" onClick={() => add.resolveMixed(true)}>
              Заменить корзину
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                add.resolveMixed(false);
                setCartSheetOpen(false);
                router.push("/checkout");
              }}
            >
              Оформить текущую корзину
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
