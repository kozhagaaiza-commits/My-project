import { Building2 } from "lucide-react";

/** Empty: «Новых заявок нет» (для других вкладок — свой текст). */
export function AteliersEmpty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
      <Building2 className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
