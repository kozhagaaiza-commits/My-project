import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface AdminErrorAlertProps {
  title: string;
  description?: string;
  onRetry?: () => void;
}

/** Состояние Error экранов админки: Alert + «Повторить» (Чертёж, Блок 4). */
export function AdminErrorAlert({ title, description, onRetry }: AdminErrorAlertProps) {
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
      {onRetry && (
        <div className="col-start-2 mt-2">
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Повторить
          </Button>
        </div>
      )}
    </Alert>
  );
}
