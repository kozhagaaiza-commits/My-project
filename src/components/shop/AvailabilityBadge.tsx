import type { Availability } from "@/types/catalog";
import { cn } from "@/lib/utils";

interface AvailabilityBadgeProps {
  availability: Availability;
  className?: string;
}

/** Срок поставки: lead_time, а если его нет в списке — числа из delivery_text («… 21–35 дней …»). */
function leadDays(a: Availability): string | null {
  if (a.lead_time) return `${a.lead_time.min_days}–${a.lead_time.max_days}`;
  const m = a.delivery_text?.match(/(\d+)[–-](\d+)\s*дн/);
  return m ? `${m[1]}–${m[2]}` : null;
}

export function AvailabilityBadge({ availability, className }: AvailabilityBadgeProps) {
  const { status } = availability;
  const days = status === "preorder" ? leadDays(availability) : null;
  const text = status === "preorder" && days ? `Под заказ · ${days} дней` : availability.label;
  const dot =
    status === "in_stock" ? "bg-success" : status === "preorder" ? "bg-silver" : "bg-muted-foreground";
  const tone = status === "out_of_stock" ? "text-muted-foreground" : "text-foreground";

  return (
    <p className={cn("flex items-center gap-2 text-sm", tone, className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot)} />
      {text}
    </p>
  );
}
