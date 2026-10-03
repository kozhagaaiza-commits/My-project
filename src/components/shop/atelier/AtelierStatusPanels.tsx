import Link from "next/link";
import { BadgeCheck, Clock, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/admin-ui/format";

/** pending: «Заявка на рассмотрении с 01.10.2026. Обычно отвечаем в течение 1 рабочего дня». */
export function AtelierPending({ createdAt }: { createdAt: string }) {
  const date = formatDateTime(createdAt).slice(0, 10);
  return (
    <Card role="status">
      <CardContent className="flex items-start gap-3">
        <Clock className="mt-0.5 size-5 shrink-0 text-silver" aria-hidden />
        <p>
          Заявка на рассмотрении{date ? ` с ${date}` : ""}. Обычно отвечаем в течение 1 рабочего дня
        </p>
      </CardContent>
    </Card>
  );
}

/** approved: «Цены для ателье активны» + «В каталог» (единственная жёлтая кнопка экрана). */
export function AtelierApproved() {
  return (
    <Card role="status">
      <CardContent className="flex flex-col gap-4">
        <p className="flex items-center gap-3 text-lg font-medium">
          <BadgeCheck className="size-6 shrink-0 text-silver" aria-hidden />
          Цены для ателье активны
        </p>
        <Button asChild className="w-full sm:w-auto sm:self-start">
          <Link href="/wheels">В каталог</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** rejected: Alert с причиной отказа (форма повторной подачи — под ним). */
export function AtelierRejectedAlert({ reason }: { reason: string | null }) {
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden />
      <AlertTitle>Заявка отклонена</AlertTitle>
      {reason && <AlertDescription>{reason}</AlertDescription>}
    </Alert>
  );
}
