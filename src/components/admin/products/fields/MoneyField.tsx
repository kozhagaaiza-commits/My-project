"use client";

import type { ReactNode } from "react";
import { AdminTextField } from "@/components/admin/products/fields/AdminTextField";

interface MoneyFieldProps {
  name: string;
  label: string;
  placeholder?: string;
  description?: ReactNode;
  className?: string;
}

/** Сумма в единицах валюты/рублей (с копейками). Разбор в минимальные единицы — buildProductBody (целочисленный). */
export function MoneyField({ name, label, placeholder, description, className }: MoneyFieldProps) {
  return (
    <AdminTextField
      name={name}
      label={label}
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      description={description}
      className={className}
      mono
    />
  );
}
