import { TriangleAlert } from "lucide-react";

export function OrderAttentionIcon({ reason }: { reason: string | null }) {
  return (
    <span title={reason ?? "Требует внимания"} className="inline-flex text-destructive">
      <TriangleAlert className="size-4" aria-hidden />
      <span className="sr-only">Требует внимания{reason ? `: ${reason}` : ""}</span>
    </span>
  );
}
