"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { RemoteStatus } from "@/hooks/use-remote-list";
import { cn } from "@/lib/utils";

export interface VehicleSelectOption {
  value: string;
  label: string;
}

interface VehicleSelectFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  options: VehicleSelectOption[];
  status: RemoteStatus;
  /** «Не удалось загрузить модели.» — выводится вместе с кнопкой «Повторить». */
  errorText: string;
  onChange: (value: string) => void;
  onRetry: () => void;
  large?: boolean;
  className?: string;
}

export function VehicleSelectField({
  id, label, placeholder, value, options, status, errorText, onChange, onRetry, large, className,
}: VehicleSelectFieldProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={status !== "ready"}>
        <SelectTrigger id={id} className={cn("w-full", large ? "h-12 text-base" : "h-10")}>
          {status === "loading" ? <Skeleton className="h-4 w-24" /> : <SelectValue placeholder={placeholder} />}
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {errorText}{" "}
          <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={onRetry}>
            Повторить
          </Button>
        </p>
      )}
    </div>
  );
}
