import { Inbox } from "lucide-react";

/** Empty: «Заказов в этом статусе нет»; при поиске — «Ничего не найдено по запросу «…»». */
export function OrdersEmpty({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">
        {query ? `Ничего не найдено по запросу «${query}»` : "Заказов в этом статусе нет"}
      </p>
    </div>
  );
}
