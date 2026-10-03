"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AutosaveFieldProps {
  label: string;
  /** Значение с сервера; смена значения снаружи сбрасывает поле через key у родителя. */
  value: string | null;
  maxLength: number;
  multiline?: boolean;
  hint?: string;
  placeholder?: string;
  validate?: (value: string) => string | null;
  /** true — сохранено. Пустая строка уходит как null. */
  onSave: (value: string | null) => Promise<boolean>;
}

/** Поле с автосохранением по blur (Чертёж, «Админка — Заказ»): без изменений и при ошибке валидации запрос не уходит. */
export function AutosaveField({ label, value, maxLength, multiline, hint, placeholder, validate, onSave }: AutosaveFieldProps) {
  const id = useId();
  const [text, setText] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleBlur() {
    const next = text.trim();
    if (next === (value ?? "")) {
      setError(null);
      return;
    }
    const invalid = validate?.(next) ?? null;
    setError(invalid);
    if (invalid) return;
    setSaving(true);
    try {
      await onSave(next === "" ? null : next);
    } finally {
      setSaving(false);
    }
  }

  const common = {
    id,
    value: text,
    maxLength,
    placeholder,
    onBlur: handleBlur,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {saving && <span className="text-xs text-muted-foreground">Сохраняется…</span>}
      </div>
      {multiline ? (
        <Textarea {...common} rows={4} onChange={(e) => setText(e.target.value)} />
      ) : (
        <Input {...common} onChange={(e) => setText(e.target.value)} />
      )}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
