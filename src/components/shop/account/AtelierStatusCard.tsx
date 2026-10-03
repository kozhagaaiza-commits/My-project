import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export const ATELIER_STATUS_LABELS: Record<string, string> = {
  pending: "На рассмотрении",
  approved: "Одобрена",
  rejected: "Отклонена",
};

interface AtelierStatusCardProps {
  /** null — заявки нет. */
  status: string | null;
}

/** Статус заявки ателье или ссылка «Вы ателье? Подать заявку» (рендерится только при FEATURE_ATELIER). */
export function AtelierStatusCard({ status }: AtelierStatusCardProps) {
  const label = status ? ATELIER_STATUS_LABELS[status] : null;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {label ? (
          <>
            <span className="text-muted-foreground">Заявка ателье</span>
            <Link href="/atelier" className="inline-flex font-medium underline-offset-4 hover:underline max-md:min-h-11 max-md:items-center">
              {status === "rejected" ? `${label}. Подать повторно` : label}
            </Link>
          </>
        ) : (
          <Link href="/atelier" className="inline-flex font-medium underline-offset-4 hover:underline max-md:min-h-11 max-md:items-center">Вы ателье? Подать заявку</Link>
        )}
      </CardContent>
    </Card>
  );
}
