"use client";

import { useState, type ComponentProps } from "react";
import type { FieldPath, FieldValues } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react";
import { AuthField } from "@/components/shop/auth/AuthField";
import { Button } from "@/components/ui/button";

type PasswordFieldProps<T extends FieldValues> = Omit<ComponentProps<typeof AuthField<T>>, "type" | "adornment"> & { name: FieldPath<T> };

/** Поле пароля с кнопкой показа (Eye / EyeOff). */
export function PasswordField<T extends FieldValues>(props: PasswordFieldProps<T>) {
  const [visible, setVisible] = useState(false);
  return (
    <AuthField
      {...props}
      type={visible ? "text" : "password"}
      adornment={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-0 right-0 size-9 text-muted-foreground"
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      }
    />
  );
}
