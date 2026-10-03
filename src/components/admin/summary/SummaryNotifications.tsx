import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { pluralRu } from "@/lib/admin-ui/format";

/** notifications_failed > 0 → «3 уведомления не доставлены» (детали в логах Vercel). */
export function SummaryNotifications({ failed }: { failed: number }) {
  if (failed <= 0) return null;
  const noun = pluralRu(failed, "уведомление", "уведомления", "уведомлений");
  const verb = pluralRu(failed, "не доставлено", "не доставлены", "не доставлено");
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden />
      <AlertTitle>
        {failed} {noun} {verb}
      </AlertTitle>
      <AlertDescription>Детали в логах Vercel</AlertDescription>
    </Alert>
  );
}
