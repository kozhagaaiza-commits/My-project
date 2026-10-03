import { CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ListFitment } from "@/types/catalog";
import { cn } from "@/lib/utils";

interface FitmentNoteProps {
  fitment: ListFitment | null;
  /** «BMW 5 Series G30» — нужен для полного варианта. */
  vehicleName?: string;
  variant?: "compact" | "full";
  className?: string;
}

const HUB_RINGS_HINT = "Центровочные кольца в комплекте";

export function FitmentNote({ fitment, vehicleName, variant = "compact", className }: FitmentNoteProps) {
  if (!fitment) {
    if (variant === "compact") return null;
    return (
      <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <CircleHelp className="size-4 shrink-0" aria-hidden />
        Выберите авто, чтобы проверить совместимость
      </p>
    );
  }

  const full = variant === "full";
  const Icon = fitment.fits ? CircleCheck : CircleX;
  const text = fitment.fits
    ? full && vehicleName ? `Подходит для ${vehicleName}` : "Подходит"
    : full && vehicleName ? `Не подходит для ${vehicleName}` : "Не подходит";

  const content = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden />
      {text}
    </>
  );
  const base = cn("flex items-center gap-1.5 text-sm text-silver", className);
  if (!fitment.fits || !fitment.needs_hub_rings) return <p className={base}>{content}</p>;

  // Подсказка про кольца: триггер выше «растянутой» ссылки карточки (relative z-10).
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(base, "relative z-10 underline decoration-dotted underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
        >
          {content}
        </button>
      </TooltipTrigger>
      <TooltipContent>{HUB_RINGS_HINT}</TooltipContent>
    </Tooltip>
  );
}
