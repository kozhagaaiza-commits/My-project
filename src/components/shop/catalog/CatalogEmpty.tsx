import Link from "next/link";
import { Disc3, Send } from "lucide-react";
import { catalogHref, CATALOG_PATH } from "@/components/shop/catalog/catalog-params";
import { ShowAllButton } from "@/components/shop/catalog/ShowAllButton";
import { Button } from "@/components/ui/button";
import type { ProductsQuery } from "@/types/catalog";

interface CatalogEmptyProps {
  query: ProductsQuery;
  hasFilters: boolean;
  /** «BMW 5 Series G30», если выбран автомобиль. */
  vehicleName: string | null;
  /** https://t.me/<bot>?start=fit_<vehicle_id> */
  engineerUrl: string | null;
}

export function CatalogEmpty({ query, hasFilters, vehicleName, engineerUrl }: CatalogEmptyProps) {
  const wheels = query.type === "wheel_set";
  const path = CATALOG_PATH[query.type];

  let message: string;
  let actions: React.ReactNode;

  if (hasFilters) {
    message = "Ничего не найдено по фильтрам";
    actions = (
      <Button asChild variant="outline">
        <Link href={catalogHref(query.type, { vehicle: query.vehicle })}>Сбросить фильтры</Link>
      </Button>
    );
  } else if (vehicleName && engineerUrl) {
    message = wheels
      ? `Для ${vehicleName} подходящих дисков сейчас нет`
      : `Для ${vehicleName} карбона в каталоге пока нет. Найдём под заказ`;
    actions = (
      <>
        <Button asChild>
          <a href={engineerUrl} target="_blank" rel="noopener noreferrer">
            <Send aria-hidden />
            Написать инженеру
          </a>
        </Button>
        {wheels && <ShowAllButton href={path}>Показать все диски</ShowAllButton>}
      </>
    );
  } else {
    message = wheels ? "Каталог дисков готовится" : "Каталог карбона готовится";
    actions = (
      <Button asChild variant="outline">
        <Link href={wheels ? "/carbon" : "/wheels"}>{wheels ? "Смотреть карбон" : "Смотреть диски"}</Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-4 py-12 text-center">
      <Disc3 className="size-10 text-muted-foreground" aria-hidden />
      <p className="max-w-md text-lg font-medium text-balance">{message}</p>
      <div className="flex flex-col gap-3 sm:flex-row">{actions}</div>
    </div>
  );
}
