"use client";

import { Copy } from "lucide-react";
import { toast } from "@/lib/admin-ui/toast";
import { Button } from "@/components/ui/button";

interface CopyButtonProps {
  value: string;
  label: string;
  successMessage: string;
}

export function CopyButton({ value, label, successMessage }: CopyButtonProps) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error("Не удалось скопировать");
    }
  }
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label={label}>
      <Copy aria-hidden />
    </Button>
  );
}
