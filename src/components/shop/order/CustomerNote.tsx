import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CustomerNoteProps {
  note: string;
}

/** Сообщение менеджера покупателю (customer_visible_note), например причина сдвига срока. */
export function CustomerNote({ note }: CustomerNoteProps) {
  return (
    <Alert role="note" data-testid="customer-note">
      <Info aria-hidden />
      <AlertDescription className="text-foreground">{note}</AlertDescription>
    </Alert>
  );
}
