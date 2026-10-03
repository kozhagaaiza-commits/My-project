"use client";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReload: () => void;
}

/** CONFLICT (Edge Case 14): PATCH с устаревшим updated_at. */
export function ConflictDialog({ open, onOpenChange, onReload }: ConflictDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Товар изменили в другой вкладке. Загрузить актуальную версию?</AlertDialogTitle>
          <AlertDialogDescription>Ваши несохранённые изменения будут потеряны.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Остаться</AlertDialogCancel>
          <AlertDialogAction variant="outline" onClick={onReload}>Загрузить</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
