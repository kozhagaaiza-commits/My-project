import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProductsEmptyProps {
  /** true — есть поиск/фильтры: пусто из-за них, а не потому что товаров нет. */
  filtered: boolean;
  onReset: () => void;
}

export function ProductsEmpty({ filtered, onReset }: ProductsEmptyProps) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-12 text-center">
        <p className="text-muted-foreground">Ничего не найдено</p>
        <Button type="button" variant="outline" onClick={onReset}>Сбросить фильтры</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-12 text-center">
      <p className="text-lg font-medium">Товаров пока нет</p>
      <Button asChild>
        <Link href="/admin/products/new">
          <Plus aria-hidden />
          Добавить первый товар
        </Link>
      </Button>
    </div>
  );
}
